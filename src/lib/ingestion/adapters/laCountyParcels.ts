import {
  queryArcGisGeoJson,
  fetchArcGisLayerVersion,
  type ArcGisGeoJsonFeature,
} from "@/lib/ingestion/adapters/arcgis";
import { LA_COUNTY_PARCELS_DATASET } from "@/lib/ingestion/datasets";
import {
  approximateCentroid,
  geodesicAreaSqft,
} from "@/lib/ingestion/geometry";
import {
  stampProvenance,
  type AdapterFetchResult,
  type Bbox,
  type ImprovedStatus,
  type LatLng,
  type NormalizedParcel,
  type ParcelBaseAdapter,
  type ParcelGeometry,
} from "@/lib/ingestion/model";

/**
 * Adapter for the LA County Assessor parcel boundaries FeatureServer.
 * Fetches raw features (fetcher), reads their attributes (parser), and maps
 * them into the shared NormalizedParcel model with per-field provenance
 * (normalizer). Missing source values become null — never estimated.
 */

const OUT_FIELDS = [
  "AIN",
  "APN",
  "SitusFullAddress",
  "SitusAddress",
  "SitusCity",
  "SitusZIP",
  "TaxRateCity",
  "AgencyName",
  "AgencyType",
  "UseCode",
  "UseType",
  "UseDescription",
  "YearBuilt1",
  "SQFTmain1",
  "CENTER_LAT",
  "CENTER_LON",
];

function readString(
  properties: Record<string, unknown>,
  key: string,
): string | null {
  const value = properties[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readNumber(
  properties: Record<string, unknown>,
  key: string,
): number | null {
  const value = properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** "LOS ANGELES CA" → "Los Angeles" (content-preserving cleanup only). */
function cleanSitusCity(value: string | null): string | null {
  if (!value) return null;
  return titleCase(value.replace(/\s+CA$/i, "").trim()) || null;
}

/**
 * Documented derivation from the assessor's own fields (recorded in the
 * field's provenance note): use description containing "vacant" → vacant;
 * assessed main-building sqft or year built → improved; otherwise null.
 */
export function deriveImprovedStatus(properties: {
  useDescription: string | null;
  useType: string | null;
  mainSqft: number | null;
  yearBuilt: string | null;
}): ImprovedStatus | null {
  const description = `${properties.useDescription ?? ""} ${properties.useType ?? ""}`;
  if (/vacant/i.test(description)) return "vacant";
  const yearBuilt = Number.parseInt(properties.yearBuilt ?? "", 10);
  if ((properties.mainSqft ?? 0) > 0 || yearBuilt > 0) return "improved";
  return null;
}

export function normalizeLaCountyFeature(
  feature: ArcGisGeoJsonFeature,
  retrievedAt: string,
  datasetVersion: string | null,
): NormalizedParcel | null {
  const properties = feature.properties ?? {};
  const ain = readString(properties, "AIN");
  const apn = readString(properties, "APN");
  const sourceParcelId = ain ?? apn;
  if (!sourceParcelId) return null;

  const geometry =
    feature.geometry &&
    (feature.geometry.type === "Polygon" ||
      feature.geometry.type === "MultiPolygon")
      ? (feature.geometry as ParcelGeometry)
      : null;

  const centerLat = readNumber(properties, "CENTER_LAT");
  const centerLng = readNumber(properties, "CENTER_LON");
  const fallbackCentroid =
    centerLat === null || centerLng === null
      ? approximateCentroid(geometry)
      : null;

  const useType = readString(properties, "UseType");
  const useDescription = readString(properties, "UseDescription");
  const agencyName = readString(properties, "AgencyName");
  const lotAreaSqft = geodesicAreaSqft(geometry);
  const improvedStatus = deriveImprovedStatus({
    useDescription,
    useType,
    mainSqft: readNumber(properties, "SQFTmain1"),
    yearBuilt: readString(properties, "YearBuilt1"),
  });
  const jurisdictionRaw = readString(properties, "TaxRateCity");

  const parcel: NormalizedParcel = {
    sourceDatasetId: LA_COUNTY_PARCELS_DATASET.id,
    sourceParcelId,
    apn,
    ain,
    address:
      readString(properties, "SitusFullAddress") ??
      readString(properties, "SitusAddress"),
    city: cleanSitusCity(readString(properties, "SitusCity")),
    state: "CA",
    county: "Los Angeles",
    jurisdiction: jurisdictionRaw ? titleCase(jurisdictionRaw) : null,
    centroidLat: centerLat ?? fallbackCentroid?.lat ?? null,
    centroidLng: centerLng ?? fallbackCentroid?.lng ?? null,
    geometry,
    lotAreaSqft,
    zoning: null,
    landUse: useDescription ?? useType,
    ownerType: agencyName
      ? `Public agency — ${titleCase(agencyName)}`
      : null,
    improvedStatus,
    assessorUseCode: readString(properties, "UseCode"),
    sourceAgency: LA_COUNTY_PARCELS_DATASET.agency,
    sourceUrl: LA_COUNTY_PARCELS_DATASET.url,
    datasetVersion,
    sourceLastUpdated: datasetVersion,
    provenance: {},
    raw: properties,
  };

  const base = {
    datasetId: LA_COUNTY_PARCELS_DATASET.id,
    datasetName: LA_COUNTY_PARCELS_DATASET.name,
    agency: LA_COUNTY_PARCELS_DATASET.agency,
    sourceUrl: LA_COUNTY_PARCELS_DATASET.url,
    retrievedAt,
  };
  const populatedFields = (
    [
      ["apn", parcel.apn],
      ["ain", parcel.ain],
      ["address", parcel.address],
      ["city", parcel.city],
      ["county", parcel.county],
      ["jurisdiction", parcel.jurisdiction],
      ["geometry", parcel.geometry],
      ["lotAreaSqft", parcel.lotAreaSqft],
      ["landUse", parcel.landUse],
      ["ownerType", parcel.ownerType],
      ["improvedStatus", parcel.improvedStatus],
      ["assessorUseCode", parcel.assessorUseCode],
    ] as const
  )
    .filter(([, value]) => value !== null)
    .map(([field]) => field);

  parcel.provenance = stampProvenance(populatedFields, base, {
    lotAreaSqft:
      "Computed geodesically from the official parcel boundary geometry; this layer publishes no assessor lot-size field.",
    improvedStatus:
      "Derived from assessor UseDescription/SQFTmain1/YearBuilt1 fields: 'vacant' in the use description → vacant; assessed building area or year built → improved.",
    ownerType:
      "From assessor AgencyName; the public layer only identifies government owners. Private ownership is not published.",
  });

  return parcel;
}

async function fetchAndNormalize(
  geometry:
    | { kind: "point"; point: LatLng }
    | { kind: "envelope"; bbox: Bbox },
  limit?: number,
): Promise<AdapterFetchResult> {
  const retrievedAt = new Date().toISOString();
  const [version, query] = await Promise.all([
    fetchArcGisLayerVersion(LA_COUNTY_PARCELS_DATASET.url),
    queryArcGisGeoJson({
      layerUrl: LA_COUNTY_PARCELS_DATASET.url,
      geometry,
      outFields: OUT_FIELDS,
      returnGeometry: true,
      resultRecordCount: limit,
    }),
  ]);

  if (query.error) {
    return {
      parcels: [],
      rowsFetched: 0,
      rowsFailed: 0,
      errors: [query.error],
      datasetVersion: version.dataLastEdited,
      sourceLastUpdated: version.dataLastEdited,
    };
  }

  const parcels: NormalizedParcel[] = [];
  let rowsFailed = 0;
  const errors: string[] = [];
  for (const feature of query.features) {
    const parcel = normalizeLaCountyFeature(
      feature,
      retrievedAt,
      version.dataLastEdited,
    );
    if (parcel) {
      parcels.push(parcel);
    } else {
      rowsFailed += 1;
    }
  }
  if (rowsFailed > 0) {
    errors.push(
      `${rowsFailed} feature(s) skipped: no AIN/APN identifier in the source record.`,
    );
  }
  if (query.exceededTransferLimit) {
    errors.push(
      "Source reported more parcels than the requested record limit; import a smaller area or raise the limit.",
    );
  }

  return {
    parcels,
    rowsFetched: query.features.length,
    rowsFailed,
    errors,
    datasetVersion: version.dataLastEdited,
    sourceLastUpdated: version.dataLastEdited,
  };
}

export const laCountyParcelsAdapter: ParcelBaseAdapter = {
  dataset: LA_COUNTY_PARCELS_DATASET,
  fetchByPoint(point) {
    return fetchAndNormalize({ kind: "point", point });
  },
  fetchByBbox(bbox, limit) {
    return fetchAndNormalize({ kind: "envelope", bbox }, limit);
  },
};
