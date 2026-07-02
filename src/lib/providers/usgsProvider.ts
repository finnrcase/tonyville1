import "server-only";
import type {
  EnrichmentFragment,
  Parcel,
  ParcelEnricher,
  ParcelLookup,
  ProviderStatus,
  USGSTopographyData,
} from "@/types/parcel";

const EPQS_URL = "https://epqs.nationalmap.gov/v1/json";

type Pt = { lat: number; lng: number };

function round(n: number) {
  return Number(n.toFixed(1));
}

function metersToLatDeg(m: number) {
  return m / 111320;
}
function metersToLngDeg(m: number, lat: number) {
  return m / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
}

function haversineMeters(a: Pt, b: Pt) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingToCompass(from: Pt, to: Pt): NonNullable<USGSTopographyData["aspect"]> {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.cos(toRad(to.lng - from.lng));
  const norm = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  if (norm >= 315 || norm < 45) return "North";
  if (norm < 135) return "East";
  if (norm < 225) return "South";
  return "West";
}

function extractRing(geometry: Parcel["geometry"]): number[][] | null {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  const coords = geometry.coordinates as unknown[];
  if (geometry.type === "Polygon") {
    const ring = coords[0];
    return Array.isArray(ring) ? (ring as number[][]) : null;
  }
  if (geometry.type === "MultiPolygon") {
    const poly = coords[0] as unknown[] | undefined;
    const ring = poly?.[0];
    return Array.isArray(ring) ? (ring as number[][]) : null;
  }
  return null;
}

function samplePoints(input: { lat: number; lng: number; geometry?: Parcel["geometry"] }) {
  const centroid: Pt = { lat: input.lat, lng: input.lng };
  const ring = extractRing(input.geometry);
  if (ring && ring.length >= 3) {
    const step = Math.max(1, Math.floor(ring.length / 8));
    const verts: Pt[] = [];
    for (let k = 0; k < ring.length && verts.length < 8; k += step) {
      const [lng, lat] = ring[k] ?? [];
      if (Number.isFinite(lat) && Number.isFinite(lng)) verts.push({ lat, lng });
    }
    if (verts.length >= 2) return { points: [centroid, ...verts], usedPolygon: true };
  }
  const dLat = metersToLatDeg(30);
  const dLng = metersToLngDeg(30, input.lat);
  const points: Pt[] = [centroid];
  for (const i of [-1, 0, 1]) {
    for (const j of [-1, 0, 1]) {
      if (i === 0 && j === 0) continue;
      points.push({ lat: input.lat + i * dLat, lng: input.lng + j * dLng });
    }
  }
  return { points, usedPolygon: false };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sampleElevationOnce(p: Pt, signal: AbortSignal): Promise<number | undefined> {
  const url = new URL(EPQS_URL);
  url.searchParams.set("x", String(p.lng));
  url.searchParams.set("y", String(p.lat));
  url.searchParams.set("units", "Feet");
  url.searchParams.set("wkid", "4326");
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { value?: unknown };
    const value = Number(data?.value);
    return Number.isFinite(value) && value > -100000 ? value : undefined;
  } catch {
    return undefined;
  }
}

// One retry with a short backoff — EPQS can throttle transiently under burst load.
async function sampleElevation(p: Pt, signal: AbortSignal): Promise<number | undefined> {
  const first = await sampleElevationOnce(p, signal);
  if (first !== undefined || signal.aborted) return first;
  await delay(250);
  return sampleElevationOnce(p, signal);
}

function terrainClassFor(avg: number): NonNullable<USGSTopographyData["terrainClass"]> {
  if (avg < 2) return "Flat";
  if (avg < 8) return "Gentle";
  if (avg < 15) return "Moderate";
  if (avg < 30) return "Steep";
  return "Extreme";
}

function drainageFor(
  cls: USGSTopographyData["terrainClass"],
): USGSTopographyData["drainageRisk"] {
  if (cls === "Flat") return "Medium";
  if (cls === "Gentle" || cls === "Moderate") return "Low";
  if (cls === "Steep" || cls === "Extreme") return "Medium";
  return "Unknown";
}

function complexityFor(
  cls: USGSTopographyData["terrainClass"],
): USGSTopographyData["estimatedSiteComplexity"] {
  if (cls === "Flat" || cls === "Gentle") return "Low";
  if (cls === "Moderate") return "Medium";
  if (cls === "Steep" || cls === "Extreme") return "High";
  return "Unknown";
}

function unavailable(): USGSTopographyData {
  return {
    available: false,
    confidence: "Low",
    notes: ["USGS elevation data was unavailable; terrain is unconfirmed."],
  };
}

export async function getTopography(input: {
  lat: number;
  lng: number;
  geometry?: Parcel["geometry"];
}): Promise<USGSTopographyData> {
  const centroid: Pt = { lat: input.lat, lng: input.lng };
  const { points, usedPolygon } = samplePoints(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  let elevations: Array<number | undefined>;
  try {
    elevations = await Promise.all(
      points.map((p) => sampleElevation(p, controller.signal)),
    );
  } finally {
    clearTimeout(timeout);
  }

  const centroidElev = elevations[0];
  const succeeded = elevations.filter((e): e is number => e !== undefined).length;
  if (centroidElev === undefined || succeeded < 2) {
    return unavailable();
  }

  const slopes: number[] = [];
  let lowest = { elev: centroidElev, pt: centroid };
  for (let i = 1; i < points.length; i += 1) {
    const elev = elevations[i];
    if (elev === undefined) continue;
    const dist = haversineMeters(centroid, points[i]);
    if (dist >= 1) slopes.push((Math.abs(elev - centroidElev) / dist) * 100);
    if (elev < lowest.elev) lowest = { elev, pt: points[i] };
  }

  const averageSlopePercent = slopes.length
    ? round(slopes.reduce((s, v) => s + v, 0) / slopes.length)
    : 0;
  const maxSlopePercent = slopes.length ? round(Math.max(...slopes)) : 0;
  const terrainClass = terrainClassFor(averageSlopePercent);
  const aspect: USGSTopographyData["aspect"] =
    averageSlopePercent < 2 || lowest.elev >= centroidElev
      ? "Mixed"
      : bearingToCompass(centroid, lowest.pt);
  const drainageRisk = drainageFor(terrainClass);
  const estimatedSiteComplexity = complexityFor(terrainClass);
  const confidence: USGSTopographyData["confidence"] =
    usedPolygon && succeeded >= Math.ceil((points.length * 2) / 3)
      ? "High"
      : succeeded >= 3
        ? "Medium"
        : "Low";

  const notes: string[] = [
    `${terrainClass} terrain (~${averageSlopePercent}% average slope, max ~${maxSlopePercent}%).`,
    estimatedSiteComplexity === "Low"
      ? "Minimal grading expected."
      : estimatedSiteComplexity === "Medium"
        ? "Some grading likely."
        : "Significant grading likely.",
  ];
  if (drainageRisk !== "Low") notes.push("Drainage review recommended.");

  return {
    available: true,
    elevationFeet: round(centroidElev),
    averageSlopePercent,
    maxSlopePercent,
    terrainClass,
    aspect,
    drainageRisk,
    estimatedSiteComplexity,
    confidence,
    notes,
  };
}

function status(state: ProviderStatus["status"], message: string): ProviderStatus {
  return { name: "usgs", status: state, message };
}

export const usgsEnricher: ParcelEnricher = {
  name: "usgs",
  async enrich(lookup: ParcelLookup): Promise<EnrichmentFragment> {
    const topography = await getTopography({
      lat: lookup.lat,
      lng: lookup.lng,
      geometry: lookup.geometry,
    });
    return {
      topography,
      status: topography.available
        ? status("ready", "USGS topography loaded.")
        : status("error", "USGS topography unavailable."),
    };
  },
};

export const usgsProvider = {
  name: "usgs" as const,
  enricher: usgsEnricher,
  getTopography,
};
