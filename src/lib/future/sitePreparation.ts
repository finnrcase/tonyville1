import type { ScoredParcel } from "@/types/parcel";

export function getSitePreparationChecklist(parcel: ScoredParcel) {
  return [
    ...parcel.estimatedSiteWork,
    "Confirm setbacks",
    "Confirm delivery route",
    "Price utility trenching",
  ];
}
