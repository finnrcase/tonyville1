import "server-only";
import type {
  Parcel,
  ParcelRawValue,
  ParcelProviderStatus,
  SearchCenter,
  SearchFilters,
} from "@/types/parcel";

const LA_COUNTY_PARCELS_LAYER =
  "https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0";
const LA_COUNTY_PARCELS_QUERY = `${LA_COUNTY_PARCELS_LAYER}/query`;
const SQFT_PER_ACRE = 43560;
const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
const MAX_SEARCH_RADIUS_MILES = 5;
const DEFAULT_RESULT_LIMIT = 40;

type GeoJsonPolygon = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

type LaCountyProperties = Record<string, unknown>;

type LaCountyFeature = {
  type?: "Feature";
  geometry?: GeoJsonPolygon | null;
  properties?: LaCountyProperties;
};

type LaCountyFeatureCollection = {
  type?: "FeatureCollection";
  features?: LaCountyFeature[];
  error?: {
    code?: number;
    message?: string;
    details?: string[];
  };
};

export type LaCountyParcelDiagnostic = {
  endpoint: string;
  method: "GET";
  attempted: boolean;
  ok: boolean;
  statusCode?: number;
  featureCount?: number;
  geometryAvailable?: boolean;
  sampleFields?: string[];
  safeErrorMessage?: string;
};

export type LaCountyParcelSearchResult = {
  parcels: Parcel[];
  status: ParcelProviderStatus;
  message: string;
  diagnostic: LaCountyParcelDiagnostic;
};

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function firstString(fields: LaCountyProperties, keys: string[]) {
  for (const key of keys) {
    const value = asString(fields[key]);
    if (value) return value;
  }
  return undefined;
}

function firstNumber(fields: LaCountyProperties, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(fields[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function cleanCity(value: string | undefined) {
  if (!value) return "Los Angeles County";
  return value
    .replace(/\bCA\b/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sanitizeForDebug(value: string) {
  return value.slice(0, 1000);
}

function toRawJson(properties: LaCountyProperties): ParcelRawValue {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => {
      return (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      );
    }),
  ) as ParcelRawValue;
}

function milesToDegreesLatitude(miles: number) {
  return miles / 69;
}

function milesToDegreesLongitude(miles: number, lat: number) {
  const milesPerDegree = Math.max(20, Math.cos((lat * Math.PI) / 180) * 69);
  return miles / milesPerDegree;
}

function areaSqftFromGeometry(geometry: GeoJsonPolygon | undefined) {
  if (!geometry) return undefined;
  const ring =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.coordinates[0]?.[0];
  const coordinates = Array.isArray(ring)
    ? ring.filter(
        (coordinate): coordinate is [number, number] =>
          Array.isArray(coordinate) &&
          typeof coordinate[0] === "number" &&
          typeof coordinate[1] === "number",
      )
    : [];
  if (coordinates.length < 4) return undefined;

  const lat =
    coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) /
    coordinates.length;
  const feetPerDegreeLat = 69 * METERS_PER_MILE * FEET_PER_METER;
  const feetPerDegreeLng =
    Math.cos((lat * Math.PI) / 180) * 69 * METERS_PER_MILE * FEET_PER_METER;
  let area = 0;

  for (let i = 0; i < coordinates.length; i += 1) {
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[(i + 1) % coordinates.length];
    area += lng1 * feetPerDegreeLng * (lat2 * feetPerDegreeLat);
    area -= lng2 * feetPerDegreeLng * (lat1 * feetPerDegreeLat);
  }

  const sqft = Math.abs(area / 2);
  return Number.isFinite(sqft) && sqft > 0 ? sqft : undefined;
}

function geometryCenter(geometry: GeoJsonPolygon | undefined, fallback: SearchCenter) {
  const ring =
    geometry?.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry?.coordinates[0]?.[0];
  const coordinates = Array.isArray(ring)
    ? ring.filter(
        (coordinate): coordinate is [number, number] =>
          Array.isArray(coordinate) &&
          typeof coordinate[0] === "number" &&
          typeof coordinate[1] === "number",
      )
    : [];

  if (!coordinates.length) {
    return { lat: fallback.lat, lng: fallback.lng };
  }

  const totals = coordinates.reduce(
    (sum, coordinate) => ({
      lng: sum.lng + coordinate[0],
      lat: sum.lat + coordinate[1],
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: totals.lat / coordinates.length,
    lng: totals.lng / coordinates.length,
  };
}

function isRoughlyInLaCounty(center: SearchCenter) {
  return (
    center.lat >= 33.65 &&
    center.lat <= 34.9 &&
    center.lng >= -119.0 &&
    center.lng <= -117.6
  );
}

export function shouldUseLaCountyParcelFallback(center: SearchCenter) {
  const label = center.label.toLowerCase();
  const genericMapLabel =
    label === "map search area" || label === "current location";
  const labelLooksCalifornia =
    label.includes("ca") ||
    label.includes("california") ||
    label.includes("los angeles") ||
    label.includes("malibu") ||
    label.includes("pasadena") ||
    label.includes("long beach") ||
    label.includes("santa monica");

  return isRoughlyInLaCounty(center) && (labelLooksCalifornia || genericMapLabel);
}

function buildEnvelopeUrl(input: {
  center: SearchCenter;
  filters: SearchFilters;
  limit?: number;
}) {
  const radiusMiles = Math.min(
    Math.max(input.filters.radiusMiles || 1, 0.25),
    MAX_SEARCH_RADIUS_MILES,
  );
  const deltaLat = milesToDegreesLatitude(radiusMiles);
  const deltaLng = milesToDegreesLongitude(radiusMiles, input.center.lat);
  const envelope = {
    xmin: input.center.lng - deltaLng,
    ymin: input.center.lat - deltaLat,
    xmax: input.center.lng + deltaLng,
    ymax: input.center.lat + deltaLat,
    spatialReference: { wkid: 4326 },
  };
  const url = new URL(LA_COUNTY_PARCELS_QUERY);

  url.searchParams.set("f", "geojson");
  url.searchParams.set("where", "1=1");
  url.searchParams.set("geometry", JSON.stringify(envelope));
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set(
    "outFields",
    [
      "AIN",
      "APN",
      "SitusFullAddress",
      "SitusAddress",
      "SitusCity",
      "SitusZIP",
      "TaxRateCity",
      "UseType",
      "UseDescription",
      "Roll_LandValue",
      "CENTER_LAT",
      "CENTER_LON",
      "Shape.STArea()",
    ].join(","),
  );
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("resultRecordCount", String(input.limit ?? DEFAULT_RESULT_LIMIT));

  return url;
}

function buildPointUrl(input: { lat: number; lng: number; limit?: number }) {
  const url = new URL(LA_COUNTY_PARCELS_QUERY);

  url.searchParams.set("f", "geojson");
  url.searchParams.set("where", "1=1");
  url.searchParams.set("geometry", `${input.lng},${input.lat}`);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("resultRecordCount", String(input.limit ?? 3));

  return url;
}

async function fetchLaCountyGeoJson(url: URL): Promise<{
  data?: LaCountyFeatureCollection;
  diagnostic: LaCountyParcelDiagnostic;
}> {
  const diagnostic: LaCountyParcelDiagnostic = {
    endpoint: `${url.origin}${url.pathname}`,
    method: "GET",
    attempted: true,
    ok: false,
  };

  const response = await fetch(url, {
    headers: { accept: "application/geo+json, application/json" },
    next: { revalidate: 3600 },
  });
  const body = await response.text();
  let data: LaCountyFeatureCollection | undefined;

  try {
    data = JSON.parse(body) as LaCountyFeatureCollection;
  } catch {
    // Preserve a safe preview below.
  }

  const featureCount = data?.features?.length ?? 0;
  diagnostic.statusCode = response.status;
  diagnostic.ok = response.ok && !data?.error;
  diagnostic.featureCount = featureCount;
  diagnostic.geometryAvailable = Boolean(data?.features?.some((feature) => feature.geometry));
  diagnostic.sampleFields = Object.keys(data?.features?.[0]?.properties ?? {}).slice(0, 24);

  if (!diagnostic.ok) {
    diagnostic.safeErrorMessage =
      data?.error?.message ??
      `LA County GIS returned HTTP ${response.status}: ${sanitizeForDebug(body)}`;
  }

  return { data, diagnostic };
}

function mapFeatureToParcel(
  feature: LaCountyFeature,
  index: number,
  center: SearchCenter,
): Parcel | undefined {
  const properties = feature.properties ?? {};
  const geometry = feature.geometry ?? undefined;
  const calculatedCenter = geometryCenter(geometry, center);
  const apn = firstString(properties, ["APN"]);
  const ain = firstString(properties, ["AIN"]);
  const rawAddress = firstString(properties, ["SitusFullAddress", "SitusAddress"]);
  const city = cleanCity(firstString(properties, ["SitusCity", "TaxRateCity"]));
  const areaSqft =
    firstNumber(properties, ["Shape.STArea()", "Shape__Area", "SHAPE_STArea"]) ??
    areaSqftFromGeometry(geometry) ??
    7500;
  const acreage = Math.max(areaSqft / SQFT_PER_ACRE, 0.02);
  const landValue = firstNumber(properties, ["Roll_LandValue"]);
  const price = landValue ?? Math.round(Math.max(25000, acreage * 85000));
  const useDescription =
    firstString(properties, ["UseDescription", "UseType"]) ?? "Parcel";
  const incorporatedCity = firstString(properties, ["TaxRateCity"]);

  if (!Number.isFinite(calculatedCenter.lat) || !Number.isFinite(calculatedCenter.lng)) {
    return undefined;
  }

  return {
    id: `la-county-${ain ?? apn ?? index}`,
    provider: "la_county_gis",
    providerParcelId: apn ?? ain ?? `la-county-${index}`,
    apn,
    ain,
    title: apn ? `LA County parcel ${apn}` : `LA County parcel ${index + 1}`,
    address: rawAddress || "Situs address unavailable",
    city,
    county: "Los Angeles",
    state: "CA",
    price,
    acreage,
    lat: calculatedCenter.lat,
    lng: calculatedCenter.lng,
    geometry,
    priceSource: landValue ? "assessed" : "estimated",
    utilities: {
      water: false,
      electricity: false,
      sewerSeptic: false,
    },
    roadAccess: {
      available: Boolean(rawAddress),
      type: rawAddress ? "easement" : "none",
      label: rawAddress
        ? "Situs address present; legal road access requires verification"
        : "Road access unknown from LA County parcel data",
    },
    zoningRisk: "medium",
    permitFriendliness: "conditional",
    zoningSummary: incorporatedCity
      ? "LA County GIS supplied parcel geometry only. Incorporated-city zoning and planning rules require city confirmation."
      : "LA County GIS supplied parcel geometry only. County zoning remains a separate review step.",
    terrain: "Terrain pending USGS screening",
    parcelUse: useDescription,
    nearbyAmenities: [
      "LA County Assessor parcel record",
      "Public parcel geometry",
      "Provider enrichment pending",
    ],
    estimatedSiteWork: [
      "Confirm legal road access",
      "Verify utility connection path",
      "Confirm zoning and setbacks with the local planning agency",
    ],
    daysOnMarket: 0,
    highlights: [
      "LA County GIS parcel geometry available",
      apn ? `APN ${apn}` : "APN pending review",
    ],
    constraints: [
      "LA County parcels are a geometry fallback, not a listing feed",
      "Zoning/buildability must be confirmed separately",
      incorporatedCity
        ? "Incorporated-city planning data may be limited in county parcel records"
        : "County planning data is not inferred from the parcel boundary",
    ],
    raw: toRawJson(properties),
  };
}

export async function searchLaCountyParcels(input: {
  center: SearchCenter;
  filters: SearchFilters;
  regridMessage?: string;
}): Promise<LaCountyParcelSearchResult> {
  if (!shouldUseLaCountyParcelFallback(input.center)) {
    return {
      parcels: [],
      status: "empty",
      message: "LA County GIS fallback skipped because the search is outside LA County coverage.",
      diagnostic: {
        endpoint: LA_COUNTY_PARCELS_QUERY,
        method: "GET",
        attempted: false,
        ok: false,
        safeErrorMessage: "Outside LA County coverage.",
      },
    };
  }

  const url = buildEnvelopeUrl(input);

  try {
    const { data, diagnostic } = await fetchLaCountyGeoJson(url);

    if (!diagnostic.ok) {
      console.warn(
        `[Tonyville laCountyParcels] ${diagnostic.safeErrorMessage} endpoint=${diagnostic.endpoint} lat=${input.center.lat} lng=${input.center.lng}`,
      );
      return {
        parcels: [],
        status: "error",
        message:
          diagnostic.safeErrorMessage ??
          "LA County GIS parcel fallback failed.",
        diagnostic,
      };
    }

    const parcels =
      data?.features
        ?.map((feature, index) => mapFeatureToParcel(feature, index, input.center))
        .filter((parcel): parcel is Parcel => Boolean(parcel)) ?? [];

    return {
      parcels,
      status: parcels.length ? "ready" : "empty",
      message: parcels.length
        ? `Using LA County GIS parcel fallback because Regrid returned no results. ${parcels.length} parcel boundary candidate(s) loaded.`
        : "LA County GIS parcel fallback returned no parcels for this search area.",
      diagnostic,
    };
  } catch (error) {
    const safeErrorMessage = `LA County GIS parcel fallback failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.warn(`[Tonyville laCountyParcels] ${safeErrorMessage}`);

    return {
      parcels: [],
      status: "error",
      message: safeErrorMessage,
      diagnostic: {
        endpoint: LA_COUNTY_PARCELS_QUERY,
        method: "GET",
        attempted: true,
        ok: false,
        safeErrorMessage,
      },
    };
  }
}

export async function lookupLaCountyParcelAtPoint(input: {
  lat: number;
  lng: number;
}) {
  const center: SearchCenter = {
    label: "LA County point lookup",
    lat: input.lat,
    lng: input.lng,
  };
  const url = buildPointUrl(input);
  const { data, diagnostic } = await fetchLaCountyGeoJson(url);
  const parcels =
    data?.features
      ?.map((feature, index) => mapFeatureToParcel(feature, index, center))
      .filter((parcel): parcel is Parcel => Boolean(parcel)) ?? [];

  return {
    parcels,
    status: parcels.length ? "ready" : diagnostic.ok ? "empty" : "error",
    message: parcels.length
      ? "LA County GIS point lookup returned parcel geometry."
      : diagnostic.safeErrorMessage ??
        "LA County GIS point lookup returned no parcel at this coordinate.",
    diagnostic,
  } satisfies LaCountyParcelSearchResult;
}

export async function debugLaCountyParcels(input: {
  lat: number;
  lng: number;
}) {
  const url = buildPointUrl({ ...input, limit: 1 });

  try {
    const { data, diagnostic } = await fetchLaCountyGeoJson(url);
    const feature = data?.features?.[0];

    return {
      endpoint: LA_COUNTY_PARCELS_LAYER,
      endpointReachable: Boolean(diagnostic.statusCode && diagnostic.statusCode < 500),
      statusCode: diagnostic.statusCode,
      featureCount: diagnostic.featureCount ?? 0,
      sampleFields: diagnostic.sampleFields ?? [],
      geometryAvailable: Boolean(feature?.geometry),
      diagnostic,
    };
  } catch (error) {
    return {
      endpoint: LA_COUNTY_PARCELS_LAYER,
      endpointReachable: false,
      featureCount: 0,
      sampleFields: [],
      geometryAvailable: false,
      diagnostic: {
        endpoint: LA_COUNTY_PARCELS_QUERY,
        method: "GET",
        attempted: true,
        ok: false,
        safeErrorMessage:
          error instanceof Error ? error.message : "LA County GIS debug failed.",
      } satisfies LaCountyParcelDiagnostic,
    };
  }
}

export const laCountyParcelProvider = {
  name: "la_county_gis" as const,
  searchParcels: searchLaCountyParcels,
  lookupParcelAtPoint: lookupLaCountyParcelAtPoint,
  debug: debugLaCountyParcels,
  shouldUseFallback: shouldUseLaCountyParcelFallback,
};
