import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  bboxAround,
  haversineMiles,
  pointInParcelGeometry,
} from "@/lib/ingestion/geometry";
import { ALL_DATASETS } from "@/lib/ingestion/datasets";
import type {
  DataSourceOverviewRow,
  IngestionRunKind,
  IngestionRunStatus,
  IngestionRunSummary,
  LatLng,
  NormalizedParcel,
  ParcelGeometry,
  ParcelProvenance,
  SearchEventSummary,
  StoredParcel,
} from "@/lib/ingestion/model";

/**
 * Supabase-backed parcel database access. Reads use the anon key under RLS
 * read-only policies. Writes go through SECURITY DEFINER RPCs gated by
 * INGESTION_ADMIN_TOKEN (see supabase/migrations/0004) so no service-role
 * key needs to live in this codebase.
 */

export function isIngestionReadConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function isIngestionWriteConfigured(): boolean {
  return isIngestionReadConfigured() && Boolean(process.env.INGESTION_ADMIN_TOKEN);
}

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!isIngestionReadConfigured()) return null;
  if (!cachedClient) {
    cachedClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
  }
  return cachedClient;
}

function adminToken(): string {
  return process.env.INGESTION_ADMIN_TOKEN ?? "";
}

type ParcelRow = {
  id: string;
  source_dataset_id: string;
  source_parcel_id: string;
  apn: string | null;
  ain: string | null;
  address: string | null;
  city: string | null;
  state: string;
  county: string | null;
  jurisdiction: string | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
  geometry: ParcelGeometry | null;
  lot_area_sqft: number | null;
  zoning: string | null;
  land_use: string | null;
  owner_type: string | null;
  improved_status: "improved" | "vacant" | null;
  assessor_use_code: string | null;
  source_agency: string | null;
  source_url: string | null;
  dataset_version: string | null;
  source_last_updated: string | null;
  provenance: ParcelProvenance | null;
  imported_at: string;
  last_refreshed_at: string;
};

const PARCEL_COLUMNS =
  "id, source_dataset_id, source_parcel_id, apn, ain, address, city, state, county, jurisdiction, centroid_lat, centroid_lng, geometry, lot_area_sqft, zoning, land_use, owner_type, improved_status, assessor_use_code, source_agency, source_url, dataset_version, source_last_updated, provenance, imported_at, last_refreshed_at";

function rowToStoredParcel(row: ParcelRow): StoredParcel {
  return {
    id: row.id,
    sourceDatasetId: row.source_dataset_id,
    sourceParcelId: row.source_parcel_id,
    apn: row.apn,
    ain: row.ain,
    address: row.address,
    city: row.city,
    state: row.state,
    county: row.county,
    jurisdiction: row.jurisdiction,
    centroidLat: row.centroid_lat,
    centroidLng: row.centroid_lng,
    geometry: row.geometry,
    lotAreaSqft: row.lot_area_sqft,
    zoning: row.zoning,
    landUse: row.land_use,
    ownerType: row.owner_type,
    improvedStatus: row.improved_status,
    assessorUseCode: row.assessor_use_code,
    sourceAgency: row.source_agency ?? "",
    sourceUrl: row.source_url,
    datasetVersion: row.dataset_version,
    sourceLastUpdated: row.source_last_updated,
    provenance: row.provenance ?? {},
    raw: null,
    importedAt: row.imported_at,
    lastRefreshedAt: row.last_refreshed_at,
  };
}

function parcelToDbRecord(parcel: NormalizedParcel) {
  return {
    source_dataset_id: parcel.sourceDatasetId,
    source_parcel_id: parcel.sourceParcelId,
    apn: parcel.apn,
    ain: parcel.ain,
    address: parcel.address,
    city: parcel.city,
    state: parcel.state,
    county: parcel.county,
    jurisdiction: parcel.jurisdiction,
    centroid_lat: parcel.centroidLat,
    centroid_lng: parcel.centroidLng,
    geometry: parcel.geometry,
    lot_area_sqft: parcel.lotAreaSqft,
    zoning: parcel.zoning,
    land_use: parcel.landUse,
    owner_type: parcel.ownerType,
    improved_status: parcel.improvedStatus,
    assessor_use_code: parcel.assessorUseCode,
    source_agency: parcel.sourceAgency,
    source_url: parcel.sourceUrl,
    dataset_version: parcel.datasetVersion,
    source_last_updated: parcel.sourceLastUpdated,
    provenance: parcel.provenance,
    raw: parcel.raw,
  };
}

export async function beginRun(input: {
  datasetId: string;
  kind: IngestionRunKind;
  coverageArea: string;
  requestedBy: string;
}): Promise<{ runId: string | null; error: string | null }> {
  const client = getClient();
  if (!client || !isIngestionWriteConfigured()) {
    return { runId: null, error: "Parcel database writes are not configured." };
  }
  const { data, error } = await client.rpc("ingestion_begin_run", {
    admin_token: adminToken(),
    p_dataset_id: input.datasetId,
    p_kind: input.kind,
    p_coverage: input.coverageArea,
    p_requested_by: input.requestedBy,
  });
  if (error) return { runId: null, error: error.message };
  return { runId: data as string, error: null };
}

export async function finishRun(input: {
  runId: string;
  status: IngestionRunStatus;
  rowsFetched: number;
  rowsImported: number;
  rowsFailed: number;
  errors: string[];
}): Promise<string | null> {
  const client = getClient();
  if (!client) return "Parcel database is not configured.";
  const { error } = await client.rpc("ingestion_finish_run", {
    admin_token: adminToken(),
    p_run_id: input.runId,
    p_status: input.status,
    p_rows_fetched: input.rowsFetched,
    p_rows_imported: input.rowsImported,
    p_rows_failed: input.rowsFailed,
    p_errors: input.errors,
  });
  return error ? error.message : null;
}

export async function upsertParcels(
  parcels: NormalizedParcel[],
): Promise<{ imported: number; error: string | null }> {
  const client = getClient();
  if (!client || !isIngestionWriteConfigured()) {
    return { imported: 0, error: "Parcel database writes are not configured." };
  }
  let imported = 0;
  const CHUNK = 40;
  for (let start = 0; start < parcels.length; start += CHUNK) {
    const chunk = parcels.slice(start, start + CHUNK).map(parcelToDbRecord);
    const { data, error } = await client.rpc("ingestion_upsert_parcels", {
      admin_token: adminToken(),
      p_parcels: chunk,
    });
    if (error) return { imported, error: error.message };
    imported += (data as number) ?? 0;
  }
  return { imported, error: null };
}

export async function touchDataset(input: {
  datasetId: string;
  version: string | null;
  sourceLastUpdated: string | null;
}): Promise<void> {
  const client = getClient();
  if (!client || !isIngestionWriteConfigured()) return;
  await client.rpc("ingestion_touch_dataset", {
    admin_token: adminToken(),
    p_dataset_id: input.datasetId,
    p_version: input.version,
    p_source_last_updated: input.sourceLastUpdated,
  });
}

/**
 * Fresh cached parcels within a radius of the search center, nearest first.
 * Centroid bbox prefilter in SQL, exact haversine radius filter in JS.
 */
export async function searchFreshParcelsNear(input: {
  center: LatLng;
  radiusMiles: number;
  freshCutoffIso: string;
  limit: number;
}): Promise<StoredParcel[]> {
  const client = getClient();
  if (!client) return [];

  const bbox = bboxAround(input.center, input.radiusMiles);
  const { data, error } = await client
    .from("parcels")
    .select(PARCEL_COLUMNS)
    .gte("centroid_lat", bbox.south)
    .lte("centroid_lat", bbox.north)
    .gte("centroid_lng", bbox.west)
    .lte("centroid_lng", bbox.east)
    .gte("last_refreshed_at", input.freshCutoffIso)
    .limit(Math.max(input.limit * 3, 300));

  if (error || !data) return [];
  const rows = data as unknown as ParcelRow[];

  return rows
    .filter(
      (row) => row.centroid_lat !== null && row.centroid_lng !== null,
    )
    .map((row) => ({
      row,
      distance: haversineMiles(input.center, {
        lat: row.centroid_lat as number,
        lng: row.centroid_lng as number,
      }),
    }))
    .filter(({ distance }) => distance <= input.radiusMiles)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, input.limit)
    .map(({ row }) => rowToStoredParcel(row));
}

export async function recordSearchEvent(input: {
  searchedLabel: string | null;
  lat: number;
  lng: number;
  radiusMiles: number;
  sourceDatasetId: string | null;
  cacheHit: boolean;
  parcelsFound: number;
  parcelsImported: number;
  durationMs: number;
  runId: string | null;
  errors: string[];
  requestedBy: string;
}): Promise<void> {
  const client = getClient();
  if (!client || !isIngestionWriteConfigured()) return;
  await client.rpc("ingestion_record_search_event", {
    admin_token: adminToken(),
    p_searched_label: input.searchedLabel,
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_miles: input.radiusMiles,
    p_source_dataset_id: input.sourceDatasetId,
    p_cache_hit: input.cacheHit,
    p_parcels_found: input.parcelsFound,
    p_parcels_imported: input.parcelsImported,
    p_duration_ms: input.durationMs,
    p_run_id: input.runId,
    p_errors: input.errors,
    p_requested_by: input.requestedBy,
  });
}

type SearchEventRow = {
  id: string;
  searched_label: string | null;
  lat: number;
  lng: number;
  radius_miles: number;
  source_dataset_id: string | null;
  cache_hit: boolean;
  parcels_found: number;
  parcels_imported: number;
  duration_ms: number | null;
  errors: unknown;
  requested_by: string | null;
  created_at: string;
};

export async function getRecentSearchEvents(
  limit = 30,
): Promise<SearchEventSummary[]> {
  const client = getClient();
  if (!client) return [];
  const { data, error } = await client
    .from("search_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  return (data as SearchEventRow[]).map((row) => ({
    id: row.id,
    searchedLabel: row.searched_label,
    lat: row.lat,
    lng: row.lng,
    radiusMiles: row.radius_miles,
    sourceDatasetId: row.source_dataset_id,
    cacheHit: row.cache_hit,
    parcelsFound: row.parcels_found,
    parcelsImported: row.parcels_imported,
    durationMs: row.duration_ms,
    errors: Array.isArray(row.errors)
      ? row.errors.filter((entry): entry is string => typeof entry === "string")
      : [],
    requestedBy: row.requested_by,
    createdAt: row.created_at,
  }));
}

export async function findStoredParcelAtPoint(
  point: LatLng,
): Promise<StoredParcel | null> {
  const client = getClient();
  if (!client) return null;

  // Centroid prefilter (~500m box), then exact point-in-polygon on the
  // official geometry.
  const delta = 0.005;
  const { data, error } = await client
    .from("parcels")
    .select(PARCEL_COLUMNS)
    .gte("centroid_lat", point.lat - delta)
    .lte("centroid_lat", point.lat + delta)
    .gte("centroid_lng", point.lng - delta)
    .lte("centroid_lng", point.lng + delta)
    .limit(400);

  if (error || !data) return null;
  const rows = data as unknown as ParcelRow[];
  const match = rows.find((row) =>
    pointInParcelGeometry(point, row.geometry),
  );
  return match ? rowToStoredParcel(match) : null;
}

type RunRow = {
  id: string;
  dataset_id: string;
  kind: IngestionRunKind;
  status: IngestionRunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  rows_fetched: number;
  rows_imported: number;
  rows_failed: number;
  errors: unknown;
  coverage_area: string | null;
  requested_by: string | null;
};

function rowToRunSummary(row: RunRow): IngestionRunSummary {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    kind: row.kind,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    rowsFetched: row.rows_fetched,
    rowsImported: row.rows_imported,
    rowsFailed: row.rows_failed,
    errors: Array.isArray(row.errors)
      ? row.errors.filter((entry): entry is string => typeof entry === "string")
      : [],
    coverageArea: row.coverage_area,
    requestedBy: row.requested_by,
  };
}

export type DataSourcesOverview = {
  configured: boolean;
  rows: DataSourceOverviewRow[];
  recentRuns: IngestionRunSummary[];
};

export async function getDataSourcesOverview(): Promise<DataSourcesOverview> {
  const client = getClient();
  if (!client) {
    return {
      configured: false,
      rows: ALL_DATASETS.map((dataset) => ({
        dataset: { ...dataset, version: null, sourceLastUpdated: null },
        latestRun: null,
        recordCount: null,
      })),
      recentRuns: [],
    };
  }

  const [datasetsResult, runsResult] = await Promise.all([
    client
      .from("ingestion_datasets")
      .select("id, version, source_last_updated"),
    client
      .from("ingestion_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(40),
  ]);

  const dbDatasets = new Map(
    (datasetsResult.data ?? []).map((row) => [
      row.id as string,
      {
        version: (row.version as string | null) ?? null,
        sourceLastUpdated: (row.source_last_updated as string | null) ?? null,
      },
    ]),
  );
  const runs = ((runsResult.data ?? []) as RunRow[]).map(rowToRunSummary);

  const counts = new Map<string, number>();
  await Promise.all(
    ALL_DATASETS.filter((dataset) => dataset.availability === "live").map(
      async (dataset) => {
        const { count } = await client
          .from("parcels")
          .select("id", { count: "exact", head: true })
          .eq("source_dataset_id", dataset.id);
        counts.set(dataset.id, count ?? 0);
      },
    ),
  );

  // Zoning enrichment rows live on the parcel records themselves; count the
  // parcels that actually carry a zoning value from that dataset.
  if (dbDatasets.has("la-city-zoning")) {
    const { count } = await client
      .from("parcels")
      .select("id", { count: "exact", head: true })
      .not("zoning", "is", null);
    counts.set("la-city-zoning", count ?? 0);
  }

  return {
    configured: true,
    rows: ALL_DATASETS.map((dataset) => ({
      dataset: {
        ...dataset,
        version: dbDatasets.get(dataset.id)?.version ?? null,
        sourceLastUpdated: dbDatasets.get(dataset.id)?.sourceLastUpdated ?? null,
      },
      latestRun: runs.find((run) => run.datasetId === dataset.id) ?? null,
      recordCount: counts.get(dataset.id) ?? null,
    })),
    recentRuns: runs,
  };
}
