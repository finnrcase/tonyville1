/**
 * Tunables for on-demand parcel ingestion + cache. Each value can be
 * overridden with an environment variable so cache behavior is configurable
 * without code changes.
 */

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type OnDemandCacheConfig = {
  /** Cached parcels older than this are treated as stale and re-ingested. */
  freshnessDays: number;
  /** Minimum fresh cached parcels within the radius to count as coverage. */
  minFreshParcels: number;
  /** Radius (miles) used for the cache check and on-demand ingestion. */
  ingestRadiusMiles: number;
  /** Max parcels fetched from the official source per on-demand import. */
  importLimit: number;
  /** Max cached parcels returned to the search UI. */
  maxResults: number;
};

export function getOnDemandCacheConfig(): OnDemandCacheConfig {
  return {
    freshnessDays: envNumber("PARCEL_CACHE_FRESHNESS_DAYS", 30),
    minFreshParcels: envNumber("PARCEL_CACHE_MIN_PARCELS", 25),
    ingestRadiusMiles: envNumber("PARCEL_ONDEMAND_RADIUS_MILES", 0.5),
    importLimit: envNumber("PARCEL_ONDEMAND_IMPORT_LIMIT", 150),
    maxResults: envNumber("PARCEL_ONDEMAND_MAX_RESULTS", 120),
  };
}

export function freshnessCutoffIso(config: OnDemandCacheConfig): string {
  return new Date(
    Date.now() - config.freshnessDays * 24 * 60 * 60 * 1000,
  ).toISOString();
}
