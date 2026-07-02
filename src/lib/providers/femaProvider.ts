import "server-only";
import type {
  EnrichmentFragment,
  FloodRiskData,
  ParcelEnricher,
  ParcelLookup,
  ProviderStatus,
} from "@/types/parcel";

const NFHL_URL =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

type Coord = { lat: number; lng: number };
type AttrRecord = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function classify(attrs: AttrRecord): FloodRiskData {
  const zone = str(attrs.FLD_ZONE);
  const subtype = (str(attrs.ZONE_SUBTY) ?? "").toUpperCase();
  const sfha = (str(attrs.SFHA_TF) ?? "").toUpperCase() === "T";

  if (sfha && subtype.includes("FLOODWAY")) {
    return {
      available: true,
      floodZone: zone,
      riskLevel: "High",
      source: "FEMA",
      notes: [
        "Mapped in a regulatory floodway — building is typically prohibited or extremely restricted.",
      ],
    };
  }
  if (sfha) {
    return {
      available: true,
      floodZone: zone,
      riskLevel: "High",
      source: "FEMA",
      notes: [
        `Mapped in Special Flood Hazard Area (zone ${zone ?? "A/V"}); elevation and flood permitting review required.`,
      ],
    };
  }
  if (subtype.includes("0.2 PCT") || subtype.includes("0.2%")) {
    return {
      available: true,
      floodZone: zone ? `${zone} (0.2% annual)` : "X (0.2% annual)",
      riskLevel: "Medium",
      source: "FEMA",
      notes: ["Near a moderate-risk (0.2% annual chance) flood area; review recommended."],
    };
  }
  if (zone === "D") {
    return {
      available: true,
      floodZone: "D",
      riskLevel: "Unknown",
      source: "FEMA",
      notes: ["FEMA zone D: flood hazard is undetermined; manual review recommended."],
    };
  }
  if (zone) {
    return {
      available: true,
      floodZone: zone,
      riskLevel: "Low",
      source: "FEMA",
      notes: ["Outside mapped high-risk flood zones (minimal-risk area)."],
    };
  }
  return {
    available: true,
    riskLevel: "Unknown",
    source: "FEMA",
    notes: [
      "No FEMA flood polygon found at this point; the area may be unmapped — manual review recommended.",
    ],
  };
}

function unavailable(reason: string): FloodRiskData {
  return {
    available: false,
    riskLevel: "Unknown",
    source: "Unavailable",
    notes: [`${reason}; treat flood risk as unconfirmed.`],
  };
}

export async function getFloodRisk(point: Coord): Promise<FloodRiskData> {
  const url = new URL(NFHL_URL);
  url.searchParams.set("geometry", `${point.lng},${point.lat}`);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "FLD_ZONE,ZONE_SUBTY,SFHA_TF");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    if (!response.ok) {
      return unavailable(`FEMA NFHL returned ${response.status}`);
    }
    const data = (await response.json()) as {
      features?: Array<{ attributes?: AttrRecord }>;
      error?: unknown;
    };
    if (data.error) {
      return unavailable("FEMA NFHL returned an error response");
    }
    const attrs = data.features?.[0]?.attributes;
    if (!attrs) {
      return classify({});
    }
    return classify(attrs);
  } catch {
    return unavailable("FEMA flood data request failed");
  } finally {
    clearTimeout(timeout);
  }
}

function status(state: ProviderStatus["status"], message: string): ProviderStatus {
  return { name: "fema", status: state, message };
}

export const femaEnricher: ParcelEnricher = {
  name: "fema",
  async enrich(lookup: ParcelLookup): Promise<EnrichmentFragment> {
    const floodRisk = await getFloodRisk({ lat: lookup.lat, lng: lookup.lng });
    return {
      floodRisk,
      status: floodRisk.available
        ? status("ready", "FEMA flood screening loaded.")
        : status("error", "FEMA flood data unavailable."),
    };
  },
};

export const femaProvider = {
  name: "fema" as const,
  enricher: femaEnricher,
  getFloodRisk,
};
