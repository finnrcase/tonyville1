import type { Parcel } from "@/types/parcel";
import type {
  EvaluationProviderStatus,
  ZoningData,
} from "@/lib/providers/parcelEvaluationService";

export const regulatoryProvider = {
  name: "regulatory" as const,

  getZoning(parcel: Parcel): ZoningData {
    return {
      zoningCompatibility:
        parcel.permitFriendliness === "friendly"
          ? "compatible"
          : parcel.permitFriendliness === "conditional"
            ? "conditional"
            : "unknown",
      zoningSummary: parcel.zoningSummary,
      minimumSetbacksKnown: undefined,
      maxLotCoveragePct: undefined,
      heightLimitFt: undefined,
      minimumDwellingSizeSqft: undefined,
      aduAllowed: undefined,
      overlayDistricts: [],
      fireSeverity: "unknown",
      floodZone: "unknown",
      environmentalConstraint: "unknown",
      historicDistrict: undefined,
      coastalZone: undefined,
      utilityEasements: "unknown",
      providerStatus: {
        provider: "regulatory",
        status: "placeholder",
        message:
          "Regulatory data is inferred from parcel use until county GIS/FEMA/fire layers are connected.",
      },
    };
  },

  providerStatus(): EvaluationProviderStatus {
    return {
      provider: "regulatory",
      status: "placeholder",
      message:
        "County zoning, FEMA flood, fire severity, and environmental overlays are placeholders.",
    };
  },
};
