import type {
  FitScoreBreakdown,
  Parcel,
  SearchFilters,
  TonyvilleFitScore,
} from "@/types/parcel";

type ScoreContext = {
  parcel: Parcel;
  filters: SearchFilters;
  distanceMiles: number;
};

type ScoreCriterion = {
  key: keyof FitScoreBreakdown;
  label: string;
  weight: number;
  score: (context: ScoreContext) => number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const roundScore = (value: number) => Math.round(clamp(value, 0, 100));

const zoningScoreByRisk = {
  low: 96,
  medium: 70,
  high: 38,
} satisfies Record<Parcel["zoningRisk"], number>;

const roadScoreByType = {
  paved: 100,
  gravel: 78,
  easement: 56,
  none: 12,
} satisfies Record<Parcel["roadAccess"]["type"], number>;

export function distanceInMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const startLat = toRadians(from.lat);
  const endLat = toRadians(to.lat);

  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(startLat) *
      Math.cos(endLat) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scorePrice({ parcel, filters }: ScoreContext) {
  const referencePrice = filters.maxPrice || 125000;

  if (parcel.price <= 0) {
    return 45;
  }

  if (parcel.price > referencePrice) {
    const overBudgetRatio = (parcel.price - referencePrice) / referencePrice;
    return roundScore(64 - overBudgetRatio * 85);
  }

  const budgetUse = parcel.price / referencePrice;
  return roundScore(98 - budgetUse * 38);
}

function scoreLotSize({ parcel, filters }: ScoreContext) {
  const buildEnvelopeSqft = filters.modelSize * 4.5 + 650;
  const minimumAcres = buildEnvelopeSqft / 43560;

  if (parcel.acreage < minimumAcres) {
    return roundScore((parcel.acreage / minimumAcres) * 55);
  }

  if (parcel.acreage < 0.18) {
    return 70;
  }

  if (parcel.acreage <= 1.25) {
    return roundScore(86 + Math.min(parcel.acreage, 0.7) * 16);
  }

  return 82;
}

function scoreUtilities({ parcel }: ScoreContext) {
  const utilityCount = Object.values(parcel.utilities).filter(Boolean).length;

  if (utilityCount === 3) {
    return 100;
  }

  if (parcel.utilities.water && parcel.utilities.electricity) {
    return 78;
  }

  if (parcel.utilities.electricity && parcel.utilities.sewerSeptic) {
    return 72;
  }

  if (utilityCount === 1) {
    return 48;
  }

  return 24;
}

function scoreRoadAccess({ parcel }: ScoreContext) {
  return parcel.roadAccess.available
    ? roadScoreByType[parcel.roadAccess.type]
    : roadScoreByType.none;
}

function scoreZoning({ parcel }: ScoreContext) {
  return zoningScoreByRisk[parcel.zoningRisk];
}

function scoreDistance({ distanceMiles, filters }: ScoreContext) {
  if (filters.radiusMiles <= 0) {
    return 65;
  }

  if (distanceMiles > filters.radiusMiles) {
    const overage = (distanceMiles - filters.radiusMiles) / filters.radiusMiles;
    return roundScore(34 - overage * 45);
  }

  return roundScore(100 - (distanceMiles / filters.radiusMiles) * 58);
}

function scoreTerrain({ parcel }: ScoreContext) {
  const terrain = parcel.terrain.toLowerCase();

  if (
    terrain.includes("flat") ||
    terrain.includes("level") ||
    terrain.includes("open")
  ) {
    return 92;
  }

  if (terrain.includes("slope") || terrain.includes("clearing")) {
    return 72;
  }

  if (
    terrain.includes("rock") ||
    terrain.includes("ridge") ||
    terrain.includes("hillside")
  ) {
    return 48;
  }

  return 66;
}

export const TONYVILLE_SCORE_CRITERIA: ScoreCriterion[] = [
  { key: "lotSize", label: "Lot size", weight: 0.16, score: scoreLotSize },
  { key: "price", label: "Price", weight: 0.18, score: scorePrice },
  { key: "utilities", label: "Utilities", weight: 0.18, score: scoreUtilities },
  { key: "roadAccess", label: "Road access", weight: 0.12, score: scoreRoadAccess },
  { key: "zoning", label: "Zoning", weight: 0.18, score: scoreZoning },
  { key: "distance", label: "Distance", weight: 0.1, score: scoreDistance },
  { key: "terrain", label: "Terrain", weight: 0.08, score: scoreTerrain },
];

function buildBreakdown(context: ScoreContext): FitScoreBreakdown {
  return TONYVILLE_SCORE_CRITERIA.reduce(
    (breakdown, criterion) => ({
      ...breakdown,
      [criterion.key]: roundScore(criterion.score(context)),
    }),
    {
      price: 0,
      lotSize: 0,
      utilities: 0,
      roadAccess: 0,
      zoning: 0,
      distance: 0,
      terrain: 0,
    },
  );
}

function buildConsiderations(
  parcel: Parcel,
  breakdown: FitScoreBreakdown,
  filters: SearchFilters,
) {
  const considerations: string[] = [];

  if (breakdown.utilities >= 95) {
    considerations.push("Utility-ready for a faster Tonyville setup.");
  } else if (!parcel.utilities.water) {
    considerations.push("Water source needs pricing before offer.");
  } else if (!parcel.utilities.sewerSeptic) {
    considerations.push("Septic or sewer path needs confirmation.");
  }

  if (breakdown.zoning >= 90) {
    considerations.push("Friendly zoning profile for a compact home.");
  } else if (parcel.zoningRisk === "high") {
    considerations.push("Permit risk is the main diligence item.");
  }

  if (breakdown.price >= 78) {
    considerations.push("Price leaves room for site prep.");
  } else if (parcel.price > filters.maxPrice) {
    considerations.push("Above the current max price filter.");
  }

  if (breakdown.terrain < 60) {
    considerations.push("Terrain may increase foundation or access costs.");
  }

  if (parcel.roadAccess.type === "easement") {
    considerations.push("Access easement should be reviewed before closing.");
  }

  return considerations.slice(0, 4);
}

function fitLabel(score: number) {
  if (score >= 86) {
    return "Excellent fit";
  }

  if (score >= 74) {
    return "Strong fit";
  }

  if (score >= 62) {
    return "Workable fit";
  }

  return "High diligence";
}

export function tonyvilleFitScore(
  parcel: Parcel,
  filters: SearchFilters,
  distanceMiles: number,
): TonyvilleFitScore {
  const context = { parcel, filters, distanceMiles };
  const breakdown = buildBreakdown(context);
  const totalWeight = TONYVILLE_SCORE_CRITERIA.reduce(
    (sum, criterion) => sum + criterion.weight,
    0,
  );
  const total = roundScore(
    TONYVILLE_SCORE_CRITERIA.reduce(
      (sum, criterion) => sum + breakdown[criterion.key] * criterion.weight,
      0,
    ) / totalWeight,
  );

  return {
    total,
    label: fitLabel(total),
    breakdown,
    considerations: buildConsiderations(parcel, breakdown, filters),
  };
}
