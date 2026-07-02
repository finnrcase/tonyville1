import type { Parcel, ParcelEnrichment } from "@/types/parcel";
import type {
  EvaluationProviderStatus,
  ExistingConditionsData,
  UtilityData,
} from "@/lib/providers/parcelEvaluationService";

function parcelUtilityValue(
  parcel: Parcel,
  key: "water" | "electricity" | "sewerSeptic",
) {
  return parcel.provider === "regrid" || parcel.provider === "la_county_gis"
    ? undefined
    : parcel.utilities[key];
}

function isLiveParcelProvider(parcel: Parcel) {
  return parcel.provider === "regrid" || parcel.provider === "la_county_gis";
}

export const utilityProvider = {
  name: "utility" as const,

  getUtilities(parcel: Parcel, enrichment?: ParcelEnrichment): UtilityData {
    const water =
      enrichment?.utilities?.water ?? parcelUtilityValue(parcel, "water");
    const electricity =
      enrichment?.utilities?.electricity ??
      parcelUtilityValue(parcel, "electricity");
    const sewer =
      enrichment?.utilities?.sewerSeptic ??
      parcelUtilityValue(parcel, "sewerSeptic");

    return {
      utilitiesKnown: isLiveParcelProvider(parcel) ? false : true,
      powerAvailable: electricity,
      waterAvailable: water,
      sewerAvailable: sewer,
      septicLikely: sewer,
      utilityPathFeasible:
        water === false && electricity === false && sewer === false
          ? false
          : undefined,
      roadAccessConfirmed:
        parcel.roadAccess.type === "none"
          ? false
          : parcel.provider === "regrid"
            ? undefined
            : parcel.provider === "la_county_gis"
              ? undefined
              : parcel.roadAccess.available,
      providerStatus: {
        provider: "utility",
        status: isLiveParcelProvider(parcel) ? "placeholder" : "ready",
        message:
          isLiveParcelProvider(parcel)
            ? "Utility data is unknown for live parcel-provider results until a utility dataset is connected."
            : "Utility assumptions come from mock parcel data.",
      },
    };
  },

  getExistingConditions(
    parcel: Parcel,
    enrichment?: ParcelEnrichment,
  ): ExistingConditionsData {
    return {
      existingBuildings: enrichment?.propertyFeatures?.buildingSqft
        ? enrichment.propertyFeatures.buildingSqft > 0
        : undefined,
      drivewayExists: undefined,
      treeClearingLikely: parcel.terrain.toLowerCase().includes("tree")
        ? true
        : undefined,
      poolPresent: undefined,
      soil: enrichment?.soil,
      providerStatus: {
        provider: "utility",
        status: enrichment?.propertyFeatures ? "ready" : "placeholder",
        message:
          "Existing-condition data is partial until imagery, OSM, and property feature providers are expanded.",
      },
    };
  },

  providerStatus(parcel: Parcel): EvaluationProviderStatus {
    return {
      provider: "utility",
      status: isLiveParcelProvider(parcel) ? "placeholder" : "ready",
      message:
        isLiveParcelProvider(parcel)
          ? "Utility availability requires future utility/provider enrichment."
          : "Mock utility assumptions are available.",
    };
  },
};
