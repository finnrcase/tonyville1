import "server-only";
import {
  freshnessCutoffIso,
  getOnDemandCacheConfig,
} from "@/lib/ingestion/config";
import type { LatLng, StoredParcel } from "@/lib/ingestion/model";
import { runAreaImport } from "@/lib/ingestion/pipeline";
import {
  isIngestionReadConfigured,
  isIngestionWriteConfigured,
  recordSearchEvent,
  searchFreshParcelsNear,
} from "@/lib/ingestion/store";

/**
 * On-demand parcel ingestion + cache for customer searches.
 *
 * Cache check → if enough fresh parcels exist near the search center, serve
 * them; otherwise ingest the area from the official source through the
 * existing pipeline (which records an ingestion run), then serve the updated
 * cache. Every lookup — hit or miss — is recorded as a search event for the
 * Data Sources dashboard. Only real official parcels are ever returned.
 */

const BASE_DATASET_ID = "la-county-parcels";

export type OnDemandSearchResult = {
  parcels: StoredParcel[];
  cacheHit: boolean;
  parcelsImported: number;
  runId: string | null;
  errors: string[];
  durationMs: number;
  storeConfigured: boolean;
  sourceDatasetId: string;
  radiusMiles: number;
};

export async function searchParcelsOnDemand(input: {
  center: LatLng;
  label: string;
  requestedBy: string;
}): Promise<OnDemandSearchResult> {
  const startedAt = Date.now();
  const config = getOnDemandCacheConfig();
  const base = {
    sourceDatasetId: BASE_DATASET_ID,
    radiusMiles: config.ingestRadiusMiles,
  };

  if (!isIngestionReadConfigured()) {
    return {
      ...base,
      parcels: [],
      cacheHit: false,
      parcelsImported: 0,
      runId: null,
      errors: ["Parcel database is not configured."],
      durationMs: Date.now() - startedAt,
      storeConfigured: false,
    };
  }

  const query = {
    center: input.center,
    radiusMiles: config.ingestRadiusMiles,
    freshCutoffIso: freshnessCutoffIso(config),
    limit: config.maxResults,
  };
  const cached = await searchFreshParcelsNear(query);

  if (cached.length >= config.minFreshParcels) {
    const durationMs = Date.now() - startedAt;
    await recordSearchEvent({
      searchedLabel: input.label,
      lat: input.center.lat,
      lng: input.center.lng,
      radiusMiles: config.ingestRadiusMiles,
      sourceDatasetId: BASE_DATASET_ID,
      cacheHit: true,
      parcelsFound: cached.length,
      parcelsImported: 0,
      durationMs,
      runId: null,
      errors: [],
      requestedBy: input.requestedBy,
    });
    return {
      ...base,
      parcels: cached,
      cacheHit: true,
      parcelsImported: 0,
      runId: null,
      errors: [],
      durationMs,
      storeConfigured: true,
    };
  }

  // Cache miss (or stale coverage): ingest the area from the official source
  // through the existing pipeline, then serve the refreshed cache.
  if (!isIngestionWriteConfigured()) {
    const durationMs = Date.now() - startedAt;
    return {
      ...base,
      parcels: cached,
      cacheHit: cached.length > 0,
      parcelsImported: 0,
      runId: null,
      errors: [
        "Cached coverage is insufficient and ingestion writes are not configured; serving the available cached parcels only.",
      ],
      durationMs,
      storeConfigured: true,
    };
  }

  const importSummary = await runAreaImport({
    datasetId: BASE_DATASET_ID,
    center: input.center,
    radiusMiles: config.ingestRadiusMiles,
    limit: config.importLimit,
    requestedBy: input.requestedBy,
  });
  const refreshed = await searchFreshParcelsNear(query);
  const parcels = refreshed.length >= cached.length ? refreshed : cached;
  const durationMs = Date.now() - startedAt;

  await recordSearchEvent({
    searchedLabel: input.label,
    lat: input.center.lat,
    lng: input.center.lng,
    radiusMiles: config.ingestRadiusMiles,
    sourceDatasetId: BASE_DATASET_ID,
    cacheHit: false,
    parcelsFound: parcels.length,
    parcelsImported: importSummary.rowsImported,
    durationMs,
    runId: importSummary.runId,
    errors: importSummary.errors,
    requestedBy: input.requestedBy,
  });

  return {
    ...base,
    parcels,
    cacheHit: false,
    parcelsImported: importSummary.rowsImported,
    runId: importSummary.runId,
    errors: importSummary.errors,
    durationMs,
    storeConfigured: true,
  };
}
