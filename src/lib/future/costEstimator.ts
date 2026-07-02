import type { ScoredParcel } from "@/types/parcel";

export type SiteCostEstimate = {
  low: number;
  high: number;
  assumptions: string[];
};

export function estimateSiteCost(parcel: ScoredParcel): SiteCostEstimate {
  return {
    low: 12000,
    high: parcel.zoningRisk === "high" ? 52000 : 32000,
    assumptions: parcel.estimatedSiteWork,
  };
}
