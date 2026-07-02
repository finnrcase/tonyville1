import "server-only";
import type {
  EnrichmentFragment,
  FireRiskData,
  Parcel,
  ParcelEnricher,
  ParcelLookup,
  ProviderStatus,
} from "@/types/parcel";

export type { FireRiskData } from "@/types/parcel";

const CAL_FIRE_MAPSERVER =
  "https://services.gis.ca.gov/arcgis/rest/services/Environment/Fire_Severity_Zones/MapServer";

const CAL_FIRE_LAYERS = [
  { id: 0, name: "State Responsibility Areas", responsibility: "state" },
  { id: 1, name: "Local Responsibility Areas", responsibility: "local" },
] as const;

type AttrRecord = Record<string, unknown>;
type Responsibility = (typeof CAL_FIRE_LAYERS)[number]["responsibility"];

function isCalifornia(state?: string) {
  const normalized = (state ?? "").trim().toLowerCase();
  return normalized === "ca" || normalized === "california";
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boolish(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["yes", "y", "true", "1", "sra"].includes(normalized);
  }
  return false;
}

function unavailable(reason: string): FireRiskData {
  return {
    available: false,
    fireZone: "Unknown",
    riskLevel: "Unknown",
    confidence: "Low",
    source: "Unavailable",
    notes: [`${reason}; treat wildfire risk as unconfirmed.`],
  };
}

function outsideCalFireCoverage(): FireRiskData {
  return {
    available: false,
    fireZone: "Unknown",
    riskLevel: "Unknown",
    confidence: "Low",
    source: "Unavailable",
    notes: ["Outside CAL FIRE coverage"],
  };
}

function normalizeFireZone(value: unknown): NonNullable<FireRiskData["fireZone"]> {
  const raw = str(value)?.toLowerCase() ?? "";
  if (raw.includes("very")) return "Very High";
  if (raw.includes("high")) return "High";
  if (raw.includes("moderate")) return "Moderate";
  if (raw.includes("low")) return "Low";
  return "Unknown";
}

function riskForZone(zone: FireRiskData["fireZone"]): FireRiskData["riskLevel"] {
  if (zone === "Very High") return "Extreme";
  if (zone === "High") return "High";
  if (zone === "Moderate") return "Medium";
  if (zone === "Low") return "Low";
  return "Unknown";
}

function notesForZone(zone: FireRiskData["fireZone"], responsibility: Responsibility) {
  const notes = [
    `CAL FIRE ${responsibility === "state" ? "SRA" : "LRA"} Fire Hazard Severity Zone screening match.`,
  ];

  if (zone === "Very High") {
    notes.push(
      "Very High Fire Hazard Severity Zone; defensible-space, insurance, access, water, and permitting review recommended.",
    );
  } else if (zone === "High") {
    notes.push(
      "High fire hazard; mitigation and permitting requirements should be reviewed before treating the parcel as build-ready.",
    );
  } else if (zone === "Moderate") {
    notes.push("Moderate fire hazard; manual screening is still recommended.");
  } else if (zone === "Low") {
    notes.push("Low mapped CAL FIRE hazard at the parcel centroid.");
  } else {
    notes.push("CAL FIRE returned a zone, but the hazard class was not recognized.");
  }

  return notes;
}

function classify(attrs: AttrRecord, responsibility: Responsibility): FireRiskData {
  const fireZone = normalizeFireZone(attrs.HAZ_CLASS);
  const stateResponsibilityArea =
    responsibility === "state" || boolish(attrs.SRA);

  return {
    available: true,
    fireZone,
    stateResponsibilityArea,
    localResponsibilityArea: responsibility === "local",
    riskLevel: riskForZone(fireZone),
    confidence: fireZone === "Unknown" ? "Medium" : "High",
    source: "CAL FIRE",
    notes: notesForZone(fireZone, responsibility),
  };
}

async function queryLayer(input: {
  layerId: number;
  lat: number;
  lng: number;
  signal: AbortSignal;
}) {
  const url = new URL(`${CAL_FIRE_MAPSERVER}/${input.layerId}/query`);
  url.searchParams.set("geometry", `${input.lng},${input.lat}`);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "SRA,HAZ_CODE,HAZ_CLASS");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: input.signal,
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    throw new Error(`CAL FIRE layer ${input.layerId} returned ${response.status}`);
  }

  return (await response.json()) as {
    features?: Array<{ attributes?: AttrRecord }>;
    error?: { message?: string };
  };
}

function noIntersect(): FireRiskData {
  return {
    available: true,
    fireZone: "Unknown",
    riskLevel: "Unknown",
    confidence: "Medium",
    source: "CAL FIRE",
    notes: [
      "No CAL FIRE Fire Hazard Severity Zone polygon intersected the parcel centroid.",
      "Manual review recommended before treating wildfire risk as low.",
    ],
  };
}

export async function getFireRisk(input: {
  lat: number;
  lng: number;
  state?: string;
  geometry?: Parcel["geometry"];
}): Promise<FireRiskData> {
  if (!isCalifornia(input.state)) {
    return outsideCalFireCoverage();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    for (const layer of CAL_FIRE_LAYERS) {
      const data = await queryLayer({
        layerId: layer.id,
        lat: input.lat,
        lng: input.lng,
        signal: controller.signal,
      });

      if (data.error) {
        console.warn(
          `[Tonyville provider:calFire] ${layer.name} error: ${data.error.message ?? "unknown ArcGIS error"}`,
        );
        continue;
      }

      const attrs = data.features?.[0]?.attributes;
      if (attrs) {
        return classify(attrs, layer.responsibility);
      }
    }

    return noIntersect();
  } catch (error) {
    console.warn(
      `[Tonyville provider:calFire] ${error instanceof Error ? error.message : "Fire hazard request failed"}`,
    );
    return unavailable("CAL FIRE fire hazard data request failed");
  } finally {
    clearTimeout(timeout);
  }
}

function status(state: ProviderStatus["status"], message: string): ProviderStatus {
  return { name: "calFire", status: state, message };
}

export const calFireEnricher: ParcelEnricher = {
  name: "calFire",
  async enrich(lookup: ParcelLookup): Promise<EnrichmentFragment> {
    const fireRisk = await getFireRisk({
      lat: lookup.lat,
      lng: lookup.lng,
      state: lookup.state,
      geometry: lookup.geometry,
    });

    return {
      fireRisk,
      status: fireRisk.available
        ? status("ready", "CAL FIRE wildfire screening loaded.")
        : status("empty", fireRisk.notes[0] ?? "CAL FIRE wildfire data unavailable."),
    };
  },
};

export const calFireProvider = {
  name: "calFire" as const,
  enricher: calFireEnricher,
  getFireRisk,
};
