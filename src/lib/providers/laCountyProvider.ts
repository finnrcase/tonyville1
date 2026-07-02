import "server-only";
import type {
  Assessment,
  EnrichmentFragment,
  LaCountyParcelData,
  ParcelDetails,
  ParcelEnricher,
  ParcelLookup,
  ProviderStatus,
} from "@/types/parcel";

const LA_COUNTY_PARCELS_URL =
  "https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0/query";

type AttrRecord = Record<string, unknown>;

function status(state: ProviderStatus["status"], message: string): ProviderStatus {
  return { name: "laCounty", status: state, message };
}

function isLaCounty(lookup: ParcelLookup) {
  return (
    lookup.state.trim().toLowerCase() === "ca" ||
    lookup.state.trim().toLowerCase() === "california"
  ) && lookup.county.trim().toLowerCase().includes("los angeles");
}

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function unavailable(reason: string): LaCountyParcelData {
  return {
    available: false,
    source: "Unavailable",
    notes: [reason],
  };
}

export async function getLaCountyParcelData(
  lookup: ParcelLookup,
): Promise<LaCountyParcelData> {
  if (!isLaCounty(lookup)) {
    return unavailable("Outside LA County GIS parcel coverage");
  }

  const url = new URL(LA_COUNTY_PARCELS_URL);
  url.searchParams.set("geometry", `${lookup.lng},${lookup.lat}`);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set(
    "outFields",
    "AIN,APN,SitusFullAddress,SitusCity,UseType,UseDescription,Roll_LandValue,Roll_ImpValue,LegalDescription,CENTER_LAT,CENTER_LON",
  );
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
      return unavailable(`LA County GIS returned ${response.status}`);
    }
    const data = (await response.json()) as {
      features?: Array<{ attributes?: AttrRecord }>;
      error?: { message?: string };
    };
    if (data.error) {
      return unavailable(`LA County GIS error: ${data.error.message ?? "unknown"}`);
    }
    const attrs = data.features?.[0]?.attributes;
    if (!attrs) {
      return {
        available: false,
        source: "Unavailable",
        notes: ["LA County GIS returned no parcel at this point."],
      };
    }

    return {
      available: true,
      ain: str(attrs.AIN),
      apn: str(attrs.APN),
      situsAddress: str(attrs.SitusFullAddress),
      situsCity: str(attrs.SitusCity),
      useType: str(attrs.UseType),
      useDescription: str(attrs.UseDescription),
      landValue: num(attrs.Roll_LandValue),
      improvementValue: num(attrs.Roll_ImpValue),
      legalDescription: str(attrs.LegalDescription),
      source: "LA County GIS",
      notes: ["LA County Assessor parcel screen loaded."],
    };
  } catch (error) {
    console.warn(
      `[Tonyville provider:laCounty] ${
        error instanceof Error ? error.message : "LA County GIS request failed"
      }`,
    );
    return unavailable("LA County GIS request failed");
  } finally {
    clearTimeout(timeout);
  }
}

function detailsFromLa(data: LaCountyParcelData): ParcelDetails | undefined {
  if (!data.available) return undefined;
  return {
    landUse: data.useDescription ?? data.useType,
    legalDescription: data.legalDescription,
  };
}

function assessmentFromLa(data: LaCountyParcelData): Assessment | undefined {
  if (!data.available) return undefined;
  const assessedValue =
    data.landValue !== undefined || data.improvementValue !== undefined
      ? (data.landValue ?? 0) + (data.improvementValue ?? 0)
      : undefined;
  return assessedValue !== undefined ? { assessedValue } : undefined;
}

export const laCountyEnricher: ParcelEnricher = {
  name: "laCounty",
  async enrich(lookup: ParcelLookup): Promise<EnrichmentFragment> {
    const laCountyParcel = await getLaCountyParcelData(lookup);
    return {
      laCountyParcel,
      details: detailsFromLa(laCountyParcel),
      assessment: assessmentFromLa(laCountyParcel),
      status: laCountyParcel.available
        ? status("ready", "LA County GIS parcel screen loaded.")
        : status("empty", laCountyParcel.notes[0] ?? "LA County GIS unavailable."),
    };
  },
};

export const laCountyProvider = {
  name: "laCounty" as const,
  enricher: laCountyEnricher,
  getLaCountyParcelData,
};
