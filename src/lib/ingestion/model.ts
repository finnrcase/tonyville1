/**
 * Shared contract for the parcel data ingestion layer.
 *
 * Every source adapter (county GIS, city open data, commercial aggregators)
 * outputs the same `NormalizedParcel` shape with per-field provenance. The
 * rest of the application — and the future Site Qualification Engine — only
 * ever consumes normalized records, never raw datasets.
 *
 * Honesty rules:
 * - A value the source does not publish is `null`. Never estimated.
 * - Every populated field carries a `FieldProvenance` entry naming the
 *   official dataset, agency, and retrieval time it came from.
 * - Derived values (e.g. lot area computed from official geometry) say so in
 *   their provenance `note`.
 */

export type DatasetAvailability =
  | "live"
  | "pending"
  | "unavailable"
  | "not-configured";

export type DatasetDescriptor = {
  id: string;
  name: string;
  agency: string;
  url: string;
  coverage: string;
  availability: DatasetAvailability;
  notes: string;
};

export type FieldProvenance = {
  datasetId: string;
  datasetName: string;
  agency: string;
  sourceUrl: string;
  retrievedAt: string;
  note?: string;
};

export type ParcelProvenance = Record<string, FieldProvenance>;

export type ParcelGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

export type ImprovedStatus = "improved" | "vacant";

export type NormalizedParcel = {
  sourceDatasetId: string;
  /** Stable identifier within the source dataset (AIN for LA County). */
  sourceParcelId: string;
  apn: string | null;
  ain: string | null;
  address: string | null;
  city: string | null;
  state: string;
  county: string | null;
  jurisdiction: string | null;
  centroidLat: number | null;
  centroidLng: number | null;
  geometry: ParcelGeometry | null;
  lotAreaSqft: number | null;
  zoning: string | null;
  landUse: string | null;
  ownerType: string | null;
  improvedStatus: ImprovedStatus | null;
  assessorUseCode: string | null;
  sourceAgency: string;
  sourceUrl: string | null;
  datasetVersion: string | null;
  sourceLastUpdated: string | null;
  provenance: ParcelProvenance;
  raw: Record<string, unknown> | null;
};

/** A normalized parcel as read back from the parcel database. */
export type StoredParcel = NormalizedParcel & {
  id: string;
  importedAt: string;
};

export type LatLng = { lat: number; lng: number };

export type Bbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type AdapterFetchResult = {
  parcels: NormalizedParcel[];
  rowsFetched: number;
  rowsFailed: number;
  errors: string[];
  datasetVersion: string | null;
  sourceLastUpdated: string | null;
};

/** An adapter that produces base parcel records for an area or point. */
export type ParcelBaseAdapter = {
  dataset: DatasetDescriptor;
  fetchByPoint(point: LatLng): Promise<AdapterFetchResult>;
  fetchByBbox(bbox: Bbox, limit: number): Promise<AdapterFetchResult>;
};

/** An adapter that attaches one attribute (with provenance) to base parcels. */
export type AttributeEnrichmentAdapter = {
  dataset: DatasetDescriptor;
  appliesTo(parcel: NormalizedParcel): boolean;
  enrich(
    parcel: NormalizedParcel,
  ): Promise<{ parcel: NormalizedParcel; error?: string }>;
};

export type IngestionRunStatus = "pending" | "updating" | "imported" | "failed";

export type IngestionRunKind = "area-import" | "point-lookup";

export type IngestionRunSummary = {
  id: string;
  datasetId: string;
  kind: IngestionRunKind;
  status: IngestionRunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  rowsFetched: number;
  rowsImported: number;
  rowsFailed: number;
  errors: string[];
  coverageArea: string | null;
  requestedBy: string | null;
};

export type DataSourceOverviewRow = {
  dataset: DatasetDescriptor & {
    version: string | null;
    sourceLastUpdated: string | null;
  };
  latestRun: IngestionRunSummary | null;
  recordCount: number | null;
};

export function stampProvenance(
  fields: string[],
  base: Omit<FieldProvenance, "note">,
  notes?: Record<string, string>,
): ParcelProvenance {
  const provenance: ParcelProvenance = {};
  for (const field of fields) {
    provenance[field] = notes?.[field] ? { ...base, note: notes[field] } : base;
  }
  return provenance;
}
