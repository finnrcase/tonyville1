import "server-only";
import { attomEnricher } from "@/lib/attom";
import type { ParcelEnrichment, ParcelLookup } from "@/types/parcel";
import type {
  AttomPropertyData,
  EvaluationProviderStatus,
} from "@/lib/providers/parcelEvaluationService";

export const attomProvider = {
  name: "attom" as const,
  enricher: attomEnricher,

  async enrich(lookup: ParcelLookup) {
    return attomEnricher.enrich(lookup);
  },

  toPropertyData(enrichment?: ParcelEnrichment): AttomPropertyData | undefined {
    if (!enrichment) {
      return undefined;
    }

    return {
      details: enrichment.details,
      assessment: enrichment.assessment,
      salesHistory: enrichment.salesHistory,
      propertyFeatures: enrichment.propertyFeatures,
      utilities: enrichment.utilities,
      estimatedValue: enrichment.estimatedValue,
      providers: enrichment.providers,
    };
  },

  providerStatus(enrichment?: ParcelEnrichment): EvaluationProviderStatus {
    const status = enrichment?.providers.find((item) => item.name === "attom");

    if (!status) {
      return {
        provider: "attom",
        status: "empty",
        message: "ATTOM has not been requested for this parcel yet.",
      };
    }

    return {
      provider: "attom",
      status: status.status,
      message: status.message,
    };
  },
};
