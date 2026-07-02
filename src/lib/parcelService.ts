import "server-only";
import { attomProvider } from "@/lib/providers/attomProvider";
import { calFireProvider } from "@/lib/providers/calFireProvider";
import { femaProvider } from "@/lib/providers/femaProvider";
import { laCountyProvider } from "@/lib/providers/laCountyProvider";
import { usdaSoilProvider } from "@/lib/providers/usdaSoilProvider";
import { usgsProvider } from "@/lib/providers/usgsProvider";
import type {
  ParcelEnricher,
  ParcelEnrichment,
  ParcelLookup,
} from "@/types/parcel";

type CacheEntry = { value: ParcelEnrichment; expires: number };

type ServiceOptions = {
  ttlMs?: number;
  now?: () => number;
};

const DEFAULT_TTL_MS = Number(process.env.ATTOM_CACHE_TTL_MS) || 24 * 60 * 60 * 1000;

export function createParcelService(
  enrichers: ParcelEnricher[],
  options: ServiceOptions = {},
) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<ParcelEnrichment>>();

  async function runEnrichers(lookup: ParcelLookup): Promise<ParcelEnrichment> {
    const results = await Promise.allSettled(
      enrichers.map((enricher) => enricher.enrich(lookup)),
    );

    const enrichment: ParcelEnrichment = { parcelId: lookup.id, providers: [] };

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        enrichment.providers.push({
          name: enrichers[index].name,
          status: "error",
          message: String(result.reason),
        });
        return;
      }

      const fragment = result.value;
      enrichment.providers.push(fragment.status);
      if (fragment.details && !enrichment.details) enrichment.details = fragment.details;
      if (fragment.assessment && !enrichment.assessment) {
        enrichment.assessment = fragment.assessment;
      }
      if (fragment.salesHistory && !enrichment.salesHistory) {
        enrichment.salesHistory = fragment.salesHistory;
      }
      if (fragment.propertyFeatures && !enrichment.propertyFeatures) {
        enrichment.propertyFeatures = fragment.propertyFeatures;
      }
      if (fragment.utilities && !enrichment.utilities) enrichment.utilities = fragment.utilities;
      if (fragment.estimatedValue !== undefined) {
        enrichment.estimatedValue = fragment.estimatedValue;
      }
      if (fragment.floodRisk) enrichment.floodRisk = fragment.floodRisk;
      if (fragment.fireRisk) enrichment.fireRisk = fragment.fireRisk;
      if (fragment.topography) enrichment.topography = fragment.topography;
      if (fragment.soil) enrichment.soil = fragment.soil;
      if (fragment.laCountyParcel) {
        enrichment.laCountyParcel = fragment.laCountyParcel;
      }
    });

    return enrichment;
  }

  async function enrichParcel(lookup: ParcelLookup): Promise<ParcelEnrichment> {
    const cached = cache.get(lookup.id);
    if (cached && cached.expires > now()) {
      return cached.value;
    }

    const inflight = pending.get(lookup.id);
    if (inflight) {
      return inflight;
    }

    const promise = runEnrichers(lookup)
      .then((value) => {
        cache.set(lookup.id, { value, expires: now() + ttlMs });
        pending.delete(lookup.id);
        return value;
      })
      .catch((error) => {
        pending.delete(lookup.id);
        throw error;
      });

    pending.set(lookup.id, promise);
    return promise;
  }

  return { enrichParcel, clearCache: () => cache.clear() };
}

export const parcelService = createParcelService([
  attomProvider.enricher,
  calFireProvider.enricher,
  femaProvider.enricher,
  laCountyProvider.enricher,
  usdaSoilProvider.enricher,
  usgsProvider.enricher,
]);
