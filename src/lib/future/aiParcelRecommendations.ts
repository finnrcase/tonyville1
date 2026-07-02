import type { ScoredParcel, SearchFilters } from "@/types/parcel";

export type ParcelRecommendationRequest = {
  filters: SearchFilters;
  parcels: ScoredParcel[];
};

export async function recommendParcels(_request: ParcelRecommendationRequest) {
  void _request;

  return {
    recommendations: [],
    reason: "AI recommendations will be added after core search data stabilizes.",
  };
}
