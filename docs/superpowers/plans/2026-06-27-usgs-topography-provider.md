# USGS Topography Provider Implementation Plan

> Execute with superpowers:executing-plans (inline), TDD + commit per task.

**Goal:** Keyless USGS EPQS topography provider as an enricher, fed into the existing 15% CABN topography category, surfaced in the detail panel as early screening.

**Spec:** `docs/superpowers/specs/2026-06-27-usgs-topography-provider-design.md`

---

## Task 1: Types

`src/types/parcel.ts`:
- [ ] Add `USGSTopographyData` (the spec's type).
- [ ] `ProviderName` → `"attom" | "fema" | "usgs"`.
- [ ] `ParcelEnrichment`: add `topography?: USGSTopographyData;`.
- [ ] `EnrichmentFragment` Pick: add `| "topography"`.
- [ ] `ParcelLookup`: add `geometry?: Parcel["geometry"];`.
- [ ] `npx tsc --noEmit` → PASS; commit `feat: add USGSTopographyData type and usgs provider name`.

---

## Task 2: usgsProvider (TDD)

`src/lib/providers/usgsProvider.test.ts` then `src/lib/providers/usgsProvider.ts`.

- [ ] **Test** (EPQS mocked; elevations returned per call in order — center first):
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTopography } from "@/lib/providers/usgsProvider";

// Return a sequence of elevations for successive fetch calls.
function mockElevations(values: Array<number | null>) {
  const fn = vi.fn();
  values.forEach((v) =>
    fn.mockResolvedValueOnce(
      v === null
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ value: v }) },
    ),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

const pt = { lat: 39.78, lng: -105.03 };

describe("getTopography", () => {
  it("classifies flat terrain when all samples are level", async () => {
    mockElevations(Array(9).fill(5280));
    const r = await getTopography(pt);
    expect(r.available).toBe(true);
    expect(r.elevationFeet).toBe(5280);
    expect(r.terrainClass).toBe("Flat");
    expect(r.averageSlopePercent).toBeLessThan(2);
    expect(r.estimatedSiteComplexity).toBe("Low");
  });

  it("classifies steep terrain and reports max slope", async () => {
    // center 5280, neighbors much higher/lower -> steep
    mockElevations([5280, 5280 + 60, 5280 - 60, 5280 + 40, 5280 - 40, 5280 + 50, 5280 - 50, 5280 + 30, 5280 - 30]);
    const r = await getTopography(pt);
    expect(["Steep", "Extreme", "Moderate"]).toContain(r.terrainClass);
    expect(r.maxSlopePercent).toBeGreaterThan(r.averageSlopePercent - 0.01);
    expect(r.maxSlopePercent).toBeGreaterThan(0);
  });

  it("returns available:false confidence Low when the centroid sample fails", async () => {
    mockElevations([null, 5280, 5280]);
    const r = await getTopography(pt);
    expect(r).toMatchObject({ available: false, confidence: "Low" });
  });

  it("returns available:false when fewer than 2 samples succeed", async () => {
    mockElevations([5280, null, null, null, null, null, null, null, null]);
    const r = await getTopography(pt);
    expect(r.available).toBe(false);
  });
});
```
- [ ] Run → FAIL (module missing).
- [ ] **Implement** `src/lib/providers/usgsProvider.ts`:
```ts
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

function bearingToCompass(from: Pt, to: Pt): USGSTopographyData["aspect"] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  const norm = (deg + 360) % 360;
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
      const [lng, lat] = ring[k];
      if (Number.isFinite(lat) && Number.isFinite(lng)) verts.push({ lat, lng });
    }
    return { points: [centroid, ...verts], usedPolygon: true };
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

async function sampleElevation(p: Pt, signal: AbortSignal): Promise<number | undefined> {
  const url = new URL(EPQS_URL);
  url.searchParams.set("x", String(p.lng));
  url.searchParams.set("y", String(p.lat));
  url.searchParams.set("units", "Feet");
  url.searchParams.set("wkid", "4326");
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal, next: { revalidate: 86400 } });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { value?: unknown };
    const value = Number(data?.value);
    return Number.isFinite(value) && value > -100000 ? value : undefined;
  } catch {
    return undefined;
  }
}

function terrainClassFor(avg: number): NonNullable<USGSTopographyData["terrainClass"]> {
  if (avg < 2) return "Flat";
  if (avg < 8) return "Gentle";
  if (avg < 15) return "Moderate";
  if (avg < 30) return "Steep";
  return "Extreme";
}

function drainageFor(cls: USGSTopographyData["terrainClass"]): USGSTopographyData["drainageRisk"] {
  if (cls === "Flat") return "Medium";
  if (cls === "Gentle" || cls === "Moderate") return "Low";
  if (cls === "Steep" || cls === "Extreme") return "Medium";
  return "Unknown";
}

function complexityFor(cls: USGSTopographyData["terrainClass"]): USGSTopographyData["estimatedSiteComplexity"] {
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
    elevations = await Promise.all(points.map((p) => sampleElevation(p, controller.signal)));
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

  const averageSlopePercent = slopes.length ? round(slopes.reduce((s, v) => s + v, 0) / slopes.length) : 0;
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
```
- [ ] Run test → PASS; `npx tsc --noEmit` → PASS; commit `feat: add USGS EPQS topography provider`.

---

## Task 3: Register enricher + pass geometry

- [ ] `src/lib/parcelService.ts`: import `usgsProvider`; registry → `[attomProvider.enricher, femaProvider.enricher, usgsProvider.enricher]`; add `if (fragment.topography) enrichment.topography = fragment.topography;` in `runEnrichers`.
- [ ] `src/lib/enrichmentClient.ts`: in `toParcelLookup`, add `geometry: parcel.geometry,`.
- [ ] `npx tsc --noEmit` + `npm test -- src/lib/parcelService.test.ts` → PASS; commit `feat: register USGS enricher and pass parcel geometry to enrichment`.

---

## Task 4: CABN integration (keep weights)

`src/lib/scoring/cabnCompatibilityScore.ts` (+ test):
- [ ] Add test for `usgsTopoToCABNTopography` + steep-vs-flat topography score (append to test file).
- [ ] Add `USGSTopographyData` to the `@/types/parcel` import.
- [ ] Add pure mapper:
```ts
export function usgsTopoToCABNTopography(usgs?: USGSTopographyData) {
  if (!usgs || !usgs.available) return undefined;
  const drainage =
    usgs.drainageRisk === "Low" ? "good"
    : usgs.drainageRisk === "Medium" ? "moderate"
    : usgs.drainageRisk === "High" ? "poor"
    : "unknown";
  const aspect = usgs.aspect ? (usgs.aspect.toLowerCase() as "north" | "south" | "east" | "west" | "mixed") : "unknown";
  return {
    slopePct: usgs.averageSlopePercent,
    elevationFt: usgs.elevationFeet,
    aspect,
    drainage,
    cutFillComplexity: usgs.estimatedSiteComplexity,
  } as const;
}
```
- [ ] In `buildCABNScoringInputFromParcel`, replace the `topography: { … }` object so USGS values override when present:
```ts
    topography: {
      ...(/* existing terrain-text inference object */),
      ...usgsTopoToCABNTopography(enrichment?.topography),
    },
```
  (Spread the USGS-derived fields over the existing inferred object; `terrainDescription` stays from the parcel.)
- [ ] Run scoring tests → PASS; `npx tsc --noEmit` → PASS; commit `feat: feed USGS topography into CABN topography scoring`.

---

## Task 5: UI Topography section

`src/components/ParcelDetailPanel.tsx`:
- [ ] Add a `TopographySection` (mirrors `FloodSection`) reading `enrichment?.topography` + `enrichmentStatus === "loading"`, rendering Elevation / Average slope / Max slope / Terrain class / Solar orientation / Grading complexity / Drainage / Confidence rows, ✓/⚠ lines from `notes` and class/complexity, and the "early site-suitability screening — not an engineering report" disclaimer.
- [ ] Render `<TopographySection topo={enrichment?.topography} loading={enrichmentStatus === "loading"} />` next to `<FloodSection .../>`.
- [ ] Add `USGSTopographyData` to the panel's `@/types/parcel` import.
- [ ] `npx tsc --noEmit && npm run lint` → PASS; commit `feat: add USGS topography section to the detail panel`.

---

## Task 6: Verify

- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` → all pass.
- [ ] Live EPQS smoke via the enrich endpoint (prod server on a free port) for a flat vs hilly parcel; confirm `topography` present with sensible class. Stop server.
