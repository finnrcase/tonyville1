import type {
  CompatibilityRating,
  Parcel,
  SearchFilters,
  TinyHomeCompatibility,
  TinyHomeModel,
  TinyHomeModelSize,
} from "@/types/parcel";

export const tonyTinyHomeModels: TinyHomeModel[] = [
  {
    size: 120,
    name: "Tony 120 Studio",
    minimumLotAcres: 0.07,
    preferredLotAcres: 0.14,
    setbackAssumption: "Compact pad with 10 ft side setbacks.",
    utilityRequirements: ["water", "electricity"],
  },
  {
    size: 140,
    name: "Tony 140 Loft",
    minimumLotAcres: 0.09,
    preferredLotAcres: 0.18,
    setbackAssumption: "Small front porch and 12 ft side setbacks.",
    utilityRequirements: ["water", "electricity"],
  },
  {
    size: 160,
    name: "Tony 160 Classic",
    minimumLotAcres: 0.12,
    preferredLotAcres: 0.24,
    setbackAssumption: "Full utility run with 15 ft build envelope buffers.",
    utilityRequirements: ["water", "electricity", "sewerSeptic"],
  },
  {
    size: 200,
    name: "Tony 200 Plus",
    minimumLotAcres: 0.16,
    preferredLotAcres: 0.32,
    setbackAssumption: "Larger pad, outdoor storage, and 20 ft frontage buffer.",
    utilityRequirements: ["water", "electricity", "sewerSeptic"],
  },
  {
    size: 480,
    name: "CABN 480 Concept",
    minimumLotAcres: 0.32,
    preferredLotAcres: 0.75,
    setbackAssumption: "Larger 16 x 30 ft placeholder envelope with manual access review.",
    utilityRequirements: ["water", "electricity", "sewerSeptic"],
  },
];

export function getTinyHomeModel(size: TinyHomeModelSize) {
  return (
    tonyTinyHomeModels.find((model) => model.size === size) ??
    tonyTinyHomeModels[2]
  );
}

function ratingLabel(rating: CompatibilityRating) {
  if (rating === "excellent") {
    return "Excellent Fit";
  }

  if (rating === "good") {
    return "Good Fit";
  }

  if (rating === "possible") {
    return "Possible";
  }

  return "Not Recommended";
}

function compatibilityReason(parcel: Parcel, model: TinyHomeModel) {
  const missingUtilities = model.utilityRequirements.filter(
    (utility) => !parcel.utilities[utility],
  );

  if (parcel.acreage < model.minimumLotAcres) {
    return "Lot is below the minimum planning size.";
  }

  if (missingUtilities.length > 1) {
    return "Multiple utility paths need confirmation.";
  }

  if (parcel.zoningRisk === "high") {
    return "Possible with permit and site-work diligence.";
  }

  if (parcel.acreage >= model.preferredLotAcres && missingUtilities.length === 0) {
    return "Lot size and utility profile are strong.";
  }

  return "Fit depends on setbacks, utility run, and final placement.";
}

export function rateTinyHomeCompatibility(
  parcel: Parcel,
  model: TinyHomeModel,
): CompatibilityRating {
  const missingUtilities = model.utilityRequirements.filter(
    (utility) => !parcel.utilities[utility],
  ).length;

  if (parcel.acreage < model.minimumLotAcres || parcel.roadAccess.type === "none") {
    return "notRecommended";
  }

  if (parcel.acreage >= model.preferredLotAcres && missingUtilities === 0) {
    return parcel.zoningRisk === "high" ? "good" : "excellent";
  }

  if (parcel.acreage >= model.minimumLotAcres && missingUtilities <= 1) {
    return parcel.zoningRisk === "high" ? "possible" : "good";
  }

  return "possible";
}

export function getTinyHomeCompatibility(
  parcel: Parcel,
  filters: SearchFilters,
): TinyHomeCompatibility {
  const selectedModel = getTinyHomeModel(filters.modelSize);
  const compatibleModels = tonyTinyHomeModels.map((model) => {
    const rating = rateTinyHomeCompatibility(parcel, model);

    return {
      model,
      rating,
      reason: compatibilityReason(parcel, model),
    };
  });
  const selectedRating =
    compatibleModels.find((item) => item.model.size === selectedModel.size)
      ?.rating ?? "possible";

  return {
    selectedModel,
    selectedRating,
    summary: `${ratingLabel(selectedRating)} for the ${selectedModel.name}`,
    compatibleModels,
  };
}

export function formatCompatibilityRating(rating: CompatibilityRating) {
  return ratingLabel(rating);
}
