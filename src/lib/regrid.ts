import "server-only";
import type {
  Parcel,
  ParcelProviderStatus,
  SearchCenter,
  SearchFilters,
} from "@/types/parcel";
import { getServerEnv } from "@/lib/env";

const REGRID_BASE_URL = "https://app.regrid.com";
const REGRID_AREA_ENDPOINT = "/api/v2/parcels/area";
const REGRID_POINT_ENDPOINT = "/api/v2/parcels/point";
const METERS_PER_MILE = 1609.344;
const REGRID_MAX_RADIUS_PARAM_METERS = 32187;
const REGRID_MAX_AREA_SQ_MILES = 386.1;
const REGRID_EFFECTIVE_MAX_RADIUS_METERS = Math.floor(
  Math.sqrt(REGRID_MAX_AREA_SQ_MILES / Math.PI) * METERS_PER_MILE,
);

type RegridGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

type RegridFeature = {
  id?: string | number;
  geometry?: RegridGeometry;
  properties?: {
    headline?: string;
    path?: string;
    fields?: Record<string, unknown>;
  };
};

type RegridPointResponse = {
  area?: unknown;
  parcels?: {
    type?: string;
    features?: RegridFeature[];
  };
  buildings?: unknown;
  zoning?: unknown;
  status?: string;
  message?: string;
  error?: unknown;
  errors?: unknown;
};

export type RegridResponseShape = {
  topLevelKeys: string[];
  parcelKeys?: string[];
  featureCount?: number;
  hasBuildings?: boolean;
  hasZoning?: boolean;
  hasArea?: boolean;
};

export type RegridRequestDiagnostic = {
  endpoint: string;
  method: "GET";
  statusCode?: number;
  ok: boolean;
  responseShape?: RegridResponseShape;
  safeErrorMessage?: string;
  bodyPreview?: string;
};

export type RegridSearchResult = {
  parcels: Parcel[];
  status: ParcelProviderStatus;
  message: string;
  diagnostic?: RegridRequestDiagnostic;
};

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function firstString(fields: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asString(fields[key]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function firstNumber(fields: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(fields[key]);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function milesToMeters(miles: number) {
  return Math.max(1, Math.round(miles * METERS_PER_MILE));
}

function resolveAreaRadius(miles: number) {
  const requestedMeters = milesToMeters(miles);
  const effectiveMaxMeters = Math.min(
    REGRID_MAX_RADIUS_PARAM_METERS,
    REGRID_EFFECTIVE_MAX_RADIUS_METERS,
  );
  const meters = Math.min(requestedMeters, effectiveMaxMeters);

  return {
    meters,
    capped: requestedMeters > meters,
    maxMiles: Number((effectiveMaxMeters / METERS_PER_MILE).toFixed(1)),
  };
}

function sanitizeForDebug(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-token]")
    .replace(/token=[^&\s]+/gi, "token=[redacted]")
    .slice(0, 1200);
}

function extractRegridMessage(data: RegridPointResponse | undefined) {
  if (!data) return undefined;
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  if (typeof data.status === "string" && data.status.trim()) {
    return data.status.trim();
  }
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map(String).join("; ");
  }
  return undefined;
}

function responseShape(data: RegridPointResponse): RegridResponseShape {
  return {
    topLevelKeys: Object.keys(data).slice(0, 12),
    parcelKeys: data.parcels ? Object.keys(data.parcels).slice(0, 12) : undefined,
    featureCount: data.parcels?.features?.length,
    hasBuildings: Boolean(data.buildings),
    hasZoning: Boolean(data.zoning),
    hasArea: Boolean(data.area),
  };
}

function safeHttpMessage(status: number, data: RegridPointResponse | undefined) {
  const message = extractRegridMessage(data);
  const suffix = message ? ` ${message}` : "";

  if (status === 401) {
    return `Regrid authentication failed (401). Check REGRID_API_KEY.${suffix}`;
  }
  if (status === 403) {
    return `Regrid authorization failed (403). The token may not include this geography, endpoint, or plan access.${suffix}`;
  }
  if (status === 404) {
    return `Regrid endpoint was not found (404). Verify the endpoint path.${suffix}`;
  }
  if (status === 429) {
    return `Regrid rate limit reached (429). Retry later or reduce request volume.${suffix}`;
  }
  if (status >= 500) {
    return `Regrid server error (${status}). Retry later.${suffix}`;
  }
  return `Regrid returned HTTP ${status}.${suffix}`;
}

function isLngLatCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function polygonCenter(geometry: RegridGeometry, fallback: SearchCenter) {
  const rawCoordinates =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.coordinates[0]?.[0];
  const coordinates = Array.isArray(rawCoordinates)
    ? rawCoordinates.filter(isLngLatCoordinate)
    : [];

  if (!coordinates?.length) {
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

async function fetchRegridJson(url: URL): Promise<{
  data?: RegridPointResponse;
  diagnostic: RegridRequestDiagnostic;
}> {
  const diagnostic: RegridRequestDiagnostic = {
    endpoint: `${url.origin}${url.pathname}`,
    method: "GET",
    ok: false,
  };

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
  });
  const body = await response.text();
  let data: RegridPointResponse | undefined;

  try {
    data = JSON.parse(body) as RegridPointResponse;
  } catch {
    // Keep diagnostics safe even when Regrid returns HTML or plain text.
  }

  diagnostic.statusCode = response.status;
  diagnostic.ok = response.ok;
  diagnostic.responseShape = data ? responseShape(data) : undefined;
  diagnostic.safeErrorMessage = response.ok
    ? extractRegridMessage(data)
    : safeHttpMessage(response.status, data);
  diagnostic.bodyPreview = sanitizeForDebug(body);

  return { data, diagnostic };
}

async function safeDiagnostic(url: URL): Promise<RegridRequestDiagnostic> {
  try {
    return (await fetchRegridJson(url)).diagnostic;
  } catch (error) {
    const safeErrorMessage = `Regrid debug request failed: ${
      error instanceof Error ? error.message : String(error)
    }`;

    return {
      endpoint: `${url.origin}${url.pathname}`,
      method: "GET",
      ok: false,
      safeErrorMessage,
    };
  }
}

function buildAreaSearchUrl(input: {
  center: SearchCenter;
  radiusMeters: number;
  limit?: number;
  token: string;
}) {
  const url = new URL(REGRID_AREA_ENDPOINT, REGRID_BASE_URL);

  // GeoJSON requires [longitude, latitude]. Regrid point endpoint uses lat/lon params.
  url.searchParams.set(
    "geojson",
    JSON.stringify({
      type: "Point",
      coordinates: [input.center.lng, input.center.lat],
    }),
  );
  url.searchParams.set("radius", String(input.radiusMeters));
  url.searchParams.set("limit", String(input.limit ?? 50));
  url.searchParams.set("return_geometry", "true");
  url.searchParams.set("token", input.token);

  return url;
}

function buildPointLookupUrl(input: {
  lat: number;
  lng: number;
  token: string;
}) {
  const url = new URL(REGRID_POINT_ENDPOINT, REGRID_BASE_URL);

  url.searchParams.set("lat", String(input.lat));
  url.searchParams.set("lon", String(input.lng));
  url.searchParams.set("token", input.token);

  return url;
}

function inferPermitFriendliness(fields: Record<string, unknown>) {
  const zoning = (
    firstString(fields, ["zoning", "zoning_type", "landuse", "usedesc"]) ?? ""
  ).toLowerCase();

  if (
    zoning.includes("residential") ||
    zoning.includes("rural") ||
    zoning.includes("single")
  ) {
    return "friendly" as const;
  }

  if (zoning.includes("commercial") || zoning.includes("industrial")) {
    return "challenging" as const;
  }

  return "conditional" as const;
}

function mapFeatureToParcel(
  feature: RegridFeature,
  index: number,
  center: SearchCenter,
): Parcel | undefined {
  const fields = feature.properties?.fields ?? {};
  const geometry = feature.geometry;
  const calculatedCenter = geometry ? polygonCenter(geometry, center) : center;
  const parcelId =
    asString(feature.id) ??
    firstString(fields, ["parcelnumb", "parcel_id", "ll_uuid"]) ??
    `regrid-${index}`;
  const apn = firstString(fields, ["parcelnumb", "apn", "parcel_id"]);
  const city = firstString(fields, ["scity", "city", "mail_city"]) ?? "Nearby";
  const state = firstString(fields, ["state2", "state", "mail_state"]) ?? "TX";
  const county = firstString(fields, ["county", "county_name"]) ?? "Unknown";
  const address =
    firstString(fields, ["situs_address", "address", "saddr", "mailadd"]) ??
    "Address unavailable";
  const acreage =
    firstNumber(fields, ["ll_gisacre", "gisacre", "acres", "parcel_acres"]) ??
    0.18;
  const assessedPrice =
    firstNumber(fields, [
      "assessed_total",
      "assessed_value",
      "market_value",
      "saleprice",
      "value",
    ]) ?? Math.round(acreage * 115000);
  const permitFriendliness = inferPermitFriendliness(fields);
  const zoningRisk =
    permitFriendliness === "friendly"
      ? "low"
      : permitFriendliness === "challenging"
        ? "high"
        : "medium";

  if (!Number.isFinite(calculatedCenter.lat) || !Number.isFinite(calculatedCenter.lng)) {
    return undefined;
  }

  return {
    id: `regrid-${parcelId}`,
    provider: "regrid",
    providerParcelId: parcelId,
    apn,
    title:
      feature.properties?.headline ??
      `${city} parcel ${String(parcelId).slice(-6)}`,
    address,
    city,
    county,
    state,
    price: assessedPrice,
    acreage,
    lat: calculatedCenter.lat,
    lng: calculatedCenter.lng,
    geometry,
    priceSource: "assessed",
    utilities: {
      water: false,
      electricity: false,
      sewerSeptic: false,
    },
    roadAccess: {
      available: address !== "Address unavailable",
      type: address !== "Address unavailable" ? "easement" : "none",
      label:
        address !== "Address unavailable"
          ? "Addressed parcel; access requires verification"
          : "Road access unknown",
    },
    zoningRisk,
    permitFriendliness,
    zoningSummary:
      firstString(fields, ["zoning", "zoning_type", "landuse", "usedesc"]) ??
      "Land-use data returned by Regrid; permit fit requires local review.",
    terrain: "Terrain pending site review",
    parcelUse:
      firstString(fields, ["usedesc", "landuse", "property_use"]) ??
      "Parcel land use",
    nearbyAmenities: ["Local services pending enrichment", "County records", "Road network"],
    estimatedSiteWork: [
      "Verify utilities",
      "Confirm access and setbacks",
      "Request local permit guidance",
    ],
    daysOnMarket: 0,
    highlights: ["Live Regrid parcel candidate", "Geometry available for map review"],
    constraints: [
      "Listing price and utility availability are not confirmed by Regrid",
      "Permit diligence required before buyer recommendation",
    ],
  };
}

export async function searchRegridParcels(input: {
  center: SearchCenter;
  filters: SearchFilters;
}): Promise<RegridSearchResult> {
  const token = getServerEnv("REGRID_API_KEY", "regrid");

  if (!token) {
    const diagnostic: RegridRequestDiagnostic = {
      endpoint: `${REGRID_BASE_URL}${REGRID_AREA_ENDPOINT}`,
      method: "GET",
      ok: false,
      safeErrorMessage: "REGRID_API_KEY is not configured.",
    };

    return {
      parcels: [],
      status: "missing-key",
      message: "REGRID_API_KEY is not configured. Mock Data Fallback active.",
      diagnostic,
    };
  }

  const areaRadius = resolveAreaRadius(input.filters.radiusMiles);
  const radiusNotice = areaRadius.capped
    ? ` Regrid area search is capped to ${areaRadius.maxMiles} miles per request for this circular GeoJSON area, so the live Regrid query was capped from ${input.filters.radiusMiles} miles.`
    : "";
  const url = buildAreaSearchUrl({
    center: input.center,
    radiusMeters: areaRadius.meters,
    token,
  });

  try {
    const { data, diagnostic } = await fetchRegridJson(url);

    if (!diagnostic.ok) {
      console.warn(
        `[Tonyville regrid] ${diagnostic.safeErrorMessage} endpoint=${diagnostic.endpoint} lat=${input.center.lat} lng=${input.center.lng} requestedRadiusMiles=${input.filters.radiusMiles} regridRadiusMeters=${areaRadius.meters} body=${diagnostic.bodyPreview ?? ""}`,
      );
      return {
        parcels: [],
        status: "error",
        message: `${diagnostic.safeErrorMessage}${radiusNotice} Mock Data Fallback active.`,
        diagnostic,
      };
    }

    const parcels =
      data?.parcels?.features
        ?.map((feature, index) => mapFeatureToParcel(feature, index, input.center))
        .filter((parcel): parcel is Parcel => Boolean(parcel)) ?? [];

    if (!parcels.length) {
      console.info(
        `[Tonyville regrid] Area search returned 0 parcels. endpoint=${diagnostic.endpoint} status=${diagnostic.statusCode} lat=${input.center.lat} lng=${input.center.lng} requestedRadiusMiles=${input.filters.radiusMiles} regridRadiusMeters=${areaRadius.meters} shape=${JSON.stringify(diagnostic.responseShape)}`,
      );
    }

    return {
      parcels,
      status: parcels.length ? "ready" : "empty",
      message: parcels.length
        ? `Live Regrid parcels loaded from /api/v2/parcels/area; listing details still need enrichment.${radiusNotice}`
        : `Regrid /api/v2/parcels/area returned 0 parcels for this search area.${radiusNotice} Mock Data Fallback active. If this is unexpected, verify token geography/plan access and radius.`,
      diagnostic,
    };
  } catch (error) {
    const safeErrorMessage = `Regrid request failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.warn(
      `[Tonyville regrid] ${safeErrorMessage}`,
    );
    return {
      parcels: [],
      status: "error",
      message: `${safeErrorMessage}. Mock Data Fallback active.`,
      diagnostic: {
        endpoint: `${REGRID_BASE_URL}${REGRID_AREA_ENDPOINT}`,
        method: "GET",
        ok: false,
        safeErrorMessage,
      },
    };
  }
}

export async function lookupRegridParcelAtPoint(input: {
  lat: number;
  lng: number;
}): Promise<RegridSearchResult> {
  const token = getServerEnv("REGRID_API_KEY", "regrid-point");

  if (!token) {
    return {
      parcels: [],
      status: "missing-key",
      message: "REGRID_API_KEY is not configured.",
      diagnostic: {
        endpoint: `${REGRID_BASE_URL}${REGRID_POINT_ENDPOINT}`,
        method: "GET",
        ok: false,
        safeErrorMessage: "REGRID_API_KEY is not configured.",
      },
    };
  }

  const center: SearchCenter = {
    label: "Point lookup",
    lat: input.lat,
    lng: input.lng,
  };
  const url = buildPointLookupUrl({ ...input, token });

  try {
    const { data, diagnostic } = await fetchRegridJson(url);

    if (!diagnostic.ok) {
      console.warn(
        `[Tonyville regrid] Point lookup failed: ${diagnostic.safeErrorMessage} endpoint=${diagnostic.endpoint} lat=${input.lat} lng=${input.lng} body=${diagnostic.bodyPreview ?? ""}`,
      );
      return {
        parcels: [],
        status: "error",
        message: diagnostic.safeErrorMessage ?? "Regrid point lookup failed.",
        diagnostic,
      };
    }

    const parcels =
      data?.parcels?.features
        ?.map((feature, index) => mapFeatureToParcel(feature, index, center))
        .filter((parcel): parcel is Parcel => Boolean(parcel)) ?? [];

    return {
      parcels,
      status: parcels.length ? "ready" : "empty",
      message: parcels.length
        ? "Regrid point lookup returned parcel geometry."
        : "Regrid point lookup returned no parcel at this coordinate.",
      diagnostic,
    };
  } catch (error) {
    const safeErrorMessage = `Regrid point lookup failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.warn(`[Tonyville regrid] ${safeErrorMessage}`);
    return {
      parcels: [],
      status: "error",
      message: safeErrorMessage,
      diagnostic: {
        endpoint: `${REGRID_BASE_URL}${REGRID_POINT_ENDPOINT}`,
        method: "GET",
        ok: false,
        safeErrorMessage,
      },
    };
  }
}

export async function debugRegrid(input: {
  lat: number;
  lng: number;
  radiusMiles: number;
}) {
  const token = getServerEnv("REGRID_API_KEY", "regrid-debug");

  if (!token) {
    return {
      keyExists: false,
      tests: {
        pointLookup: {
          endpoint: `${REGRID_BASE_URL}${REGRID_POINT_ENDPOINT}`,
          ok: false,
          safeErrorMessage: "REGRID_API_KEY is not configured.",
        },
        areaSearch: {
          endpoint: `${REGRID_BASE_URL}${REGRID_AREA_ENDPOINT}`,
          ok: false,
          safeErrorMessage: "REGRID_API_KEY is not configured.",
        },
      },
    };
  }

  const center: SearchCenter = {
    label: "Debug point",
    lat: input.lat,
    lng: input.lng,
  };
  const areaRadius = resolveAreaRadius(input.radiusMiles);
  const pointUrl = buildPointLookupUrl({ lat: input.lat, lng: input.lng, token });
  const areaUrl = buildAreaSearchUrl({
    center,
    radiusMeters: areaRadius.meters,
    limit: 5,
    token,
  });

  const [pointLookup, areaSearch] = await Promise.all([
    safeDiagnostic(pointUrl),
    safeDiagnostic(areaUrl),
  ]);

  return {
    keyExists: true,
    input: {
      lat: input.lat,
      lng: input.lng,
      radiusMiles: input.radiusMiles,
      regridRadiusMeters: areaRadius.meters,
      regridRadiusCapped: areaRadius.capped,
      regridMaxRadiusMiles: areaRadius.maxMiles,
      pointLookupCoordinates: { lat: input.lat, lon: input.lng },
      areaSearchGeoJsonCoordinates: [input.lng, input.lat],
    },
    tests: {
      pointLookup,
      areaSearch,
    },
  };
}
