import type {
  FireRiskData,
  FloodRiskData,
  Parcel,
  ParcelEnrichment,
  SoilData,
  USGSTopographyData,
  UtilityKey,
} from "@/types/parcel";

export type CABNRating =
  | "Excellent"
  | "Good"
  | "Possible"
  | "High Risk"
  | "Not Recommended";

export type CABNDecision = boolean | "unknown";

export type ComplexityLevel = "Low" | "Medium" | "High" | "Unknown";

export type ConfidenceLevel = "High" | "Medium" | "Low";

export type CABNUtilityRequirement = UtilityKey | "septicOrSewer";

export type CABNModel = {
  id: string;
  name: string;
  sizeSqft: number;
  widthFt: number;
  lengthFt: number;
  footprintSqft: number;
  minimumLotAcres: number;
  preferredLotAcres: number;
  requiredClearanceFt: number;
  minimumRoadWidthFt: number;
  maximumSlopePct: number;
  foundation: "skid" | "pier" | "slab" | "helical";
  utilityRequirements: CABNUtilityRequirement[];
};

export type ScoreCheckStatus = "pass" | "warning" | "fail" | "unknown";

export type ScoreCheck = {
  id: string;
  label: string;
  status: ScoreCheckStatus;
  points: number;
  maxPoints: number;
  message: string;
  blocker?: "build" | "data";
  criticalUnknown?: boolean;
};

export type ScoreCategory = {
  label: string;
  score: number;
  earnedPoints: number;
  maxPoints: number;
  checks: ScoreCheck[];
  blockers: string[];
  warnings: string[];
  strengths: string[];
  unknowns: string[];
};

export type CABNCompatibilityResult = {
  totalScore: number;
  rating: CABNRating;
  canBuild: CABNDecision;
  recommendedModel: CABNModel | null;
  possibleModels: CABNModel[];
  blockers: string[];
  warnings: string[];
  strengths: string[];
  unknowns: string[];
  categoryScores: {
    geometry: ScoreCategory;
    physicalFit: ScoreCategory;
    topography: ScoreCategory;
    regulatory: ScoreCategory;
    utilities: ScoreCategory;
    complexity: ScoreCategory;
  };
  permittingComplexity: ComplexityLevel;
  siteComplexity: ComplexityLevel;
  confidence: ConfidenceLevel;
  nextSteps: string[];
};

export type CABNAccessType =
  | "legal"
  | "easement"
  | "informal"
  | "none"
  | "unknown";

export type CABNParcelShape =
  | "regular"
  | "irregular"
  | "narrow"
  | "flag"
  | "unknown";

export type CABNZoningCompatibility =
  | "compatible"
  | "conditional"
  | "incompatible"
  | "unknown";

export type CABNRiskLevel = "none" | "low" | "medium" | "high" | "extreme" | "unknown";

export type CABNFloodZone = "none" | "moderate" | "floodplain" | "floodway" | "unknown";

// Maps a normalized FEMA FloodRiskData result onto the CABN regulatory flood zone.
// Client-safe (no server-only import) so it can run in buildCABNScoringInputFromParcel.
export function floodRiskToCABNZone(flood?: FloodRiskData): CABNFloodZone {
  if (!flood || !flood.available) return "unknown";
  if (flood.riskLevel === "High") {
    const isFloodway = flood.notes.some((note) =>
      note.toLowerCase().includes("floodway"),
    );
    return isFloodway ? "floodway" : "floodplain";
  }
  if (flood.riskLevel === "Medium") return "moderate";
  if (flood.riskLevel === "Low") return "none";
  return "unknown";
}

// Maps normalized CAL FIRE screening data onto the CABN regulatory risk scale.
// Fire hazard is a permitting and mitigation risk, not an automatic build rejection.
export function fireRiskToCABNRiskLevel(fire?: FireRiskData): CABNRiskLevel {
  if (!fire || !fire.available) return "unknown";
  if (fire.riskLevel === "Extreme") return "extreme";
  if (fire.riskLevel === "High") return "high";
  if (fire.riskLevel === "Medium") return "medium";
  if (fire.riskLevel === "Low") return "low";
  return "unknown";
}

// Maps normalized USGS topography onto the engine's topography input fields.
// Client-safe (no server-only import). Returns undefined when data is unavailable
// so the existing unknown checks reduce confidence rather than penalize.
export function usgsTopoToCABNTopography(usgs?: USGSTopographyData) {
  if (!usgs || !usgs.available) return undefined;
  const drainage =
    usgs.drainageRisk === "Low"
      ? ("good" as const)
      : usgs.drainageRisk === "Medium"
        ? ("moderate" as const)
        : usgs.drainageRisk === "High"
          ? ("poor" as const)
          : ("unknown" as const);
  const aspect = usgs.aspect
    ? (usgs.aspect.toLowerCase() as "north" | "south" | "east" | "west" | "mixed")
    : ("unknown" as const);
  return {
    slopePct: usgs.averageSlopePercent,
    elevationFt: usgs.elevationFeet,
    aspect,
    drainage,
    cutFillComplexity: usgs.estimatedSiteComplexity,
  };
}

function soilToSiteComplexity(soil?: SoilData): ComplexityLevel | undefined {
  if (!soil || !soil.available) return undefined;
  if (
    soil.estimatedExcavationDifficulty === "High" ||
    soil.foundationSuitability === "Poor" ||
    soil.drainageRisk === "High"
  ) {
    return "High";
  }
  if (
    soil.estimatedExcavationDifficulty === "Medium" ||
    soil.foundationSuitability === "Fair" ||
    soil.septicSuitability === "Fair"
  ) {
    return "Medium";
  }
  if (
    soil.estimatedExcavationDifficulty === "Low" ||
    soil.foundationSuitability === "Good" ||
    soil.foundationSuitability === "Excellent"
  ) {
    return "Low";
  }
  return undefined;
}

export type CABNParcelScoringInput = {
  parcelId?: string;
  apn?: string;
  boundary?: {
    exists?: boolean | null;
    geometry?: unknown;
    lotAreaAcres?: number | null;
    lotAreaSqft?: number | null;
    usableAreaSqft?: number | null;
    shape?: CABNParcelShape | null;
    roadFrontageFt?: number | null;
    access?: CABNAccessType | null;
    legalRoadAccess?: boolean | null;
    dimensionsKnown?: boolean | null;
  };
  physical?: {
    maxFootprintSqft?: number | null;
    setbacksKnown?: boolean | null;
    frontSetbackFt?: number | null;
    sideSetbackFt?: number | null;
    rearSetbackFt?: number | null;
    foundationFeasible?: boolean | null;
    transportationFeasible?: boolean | null;
    craneOrTruckAccess?: boolean | null;
    minimumRoadWidthFt?: number | null;
  };
  topography?: {
    slopePct?: number | null;
    elevationFt?: number | null;
    aspect?: "north" | "south" | "east" | "west" | "mixed" | "unknown" | null;
    drainage?: "good" | "moderate" | "poor" | "unknown" | null;
    ridgelineRisk?: CABNRiskLevel | null;
    cutFillComplexity?: ComplexityLevel | null;
    terrainDescription?: string | null;
  };
  regulatory?: {
    zoningCompatibility?: CABNZoningCompatibility | null;
    zoningSummary?: string | null;
    minimumSetbacksKnown?: boolean | null;
    maxLotCoveragePct?: number | null;
    heightLimitFt?: number | null;
    minimumDwellingSizeSqft?: number | null;
    aduAllowed?: boolean | null;
    overlayDistricts?: string[];
    fireSeverity?: CABNRiskLevel | null;
    floodZone?: CABNFloodZone | null;
    environmentalConstraint?: CABNRiskLevel | null;
    historicDistrict?: boolean | null;
    coastalZone?: boolean | null;
    utilityEasements?: "none" | "minor" | "major" | "unknown" | null;
  };
  existingConditions?: {
    existingBuildings?: boolean | null;
    drivewayExists?: boolean | null;
    treeClearingLikely?: boolean | null;
    poolPresent?: boolean | null;
    soil?: SoilData | null;
  };
  utilities?: {
    utilitiesKnown?: boolean | null;
    powerAvailable?: boolean | null;
    waterAvailable?: boolean | null;
    sewerAvailable?: boolean | null;
    septicLikely?: boolean | null;
    utilityPathFeasible?: boolean | null;
    roadAccessConfirmed?: boolean | null;
  };
  complexity?: {
    permittingComplexity?: ComplexityLevel | null;
    siteWorkComplexity?: ComplexityLevel | null;
  };
};

type ModelFit = {
  model: CABNModel;
  score: number;
  blockers: string[];
  warnings: string[];
  strengths: string[];
};

const SQFT_PER_ACRE = 43560;
const UNKNOWN_CREDIT = 0.45;

export const CABN_MODELS: CABNModel[] = [
  {
    id: "cabn-120",
    name: "CABN 120 Studio",
    sizeSqft: 120,
    widthFt: 10,
    lengthFt: 12,
    footprintSqft: 120,
    minimumLotAcres: 0.08,
    preferredLotAcres: 0.16,
    requiredClearanceFt: 10,
    minimumRoadWidthFt: 10,
    maximumSlopePct: 15,
    foundation: "pier",
    utilityRequirements: ["electricity", "water", "septicOrSewer"],
  },
  {
    id: "cabn-140",
    name: "CABN 140 Loft",
    sizeSqft: 140,
    widthFt: 10,
    lengthFt: 14,
    footprintSqft: 140,
    minimumLotAcres: 0.09,
    preferredLotAcres: 0.18,
    requiredClearanceFt: 12,
    minimumRoadWidthFt: 10,
    maximumSlopePct: 15,
    foundation: "pier",
    utilityRequirements: ["electricity", "water", "septicOrSewer"],
  },
  {
    id: "cabn-160",
    name: "CABN 160 Classic",
    sizeSqft: 160,
    widthFt: 10,
    lengthFt: 16,
    footprintSqft: 160,
    minimumLotAcres: 0.12,
    preferredLotAcres: 0.24,
    requiredClearanceFt: 15,
    minimumRoadWidthFt: 11,
    maximumSlopePct: 12,
    foundation: "pier",
    utilityRequirements: ["electricity", "water", "septicOrSewer"],
  },
  {
    id: "cabn-200",
    name: "CABN 200 Plus",
    sizeSqft: 200,
    widthFt: 10,
    lengthFt: 20,
    footprintSqft: 200,
    minimumLotAcres: 0.16,
    preferredLotAcres: 0.32,
    requiredClearanceFt: 20,
    minimumRoadWidthFt: 12,
    maximumSlopePct: 10,
    foundation: "pier",
    utilityRequirements: ["electricity", "water", "septicOrSewer"],
  },
  {
    id: "cabn-480",
    name: "CABN 480 Concept",
    sizeSqft: 480,
    widthFt: 16,
    lengthFt: 30,
    footprintSqft: 480,
    minimumLotAcres: 0.32,
    preferredLotAcres: 0.75,
    requiredClearanceFt: 25,
    minimumRoadWidthFt: 14,
    maximumSlopePct: 8,
    foundation: "helical",
    utilityRequirements: ["electricity", "water", "septicOrSewer"],
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const round = (value: number) => Math.round(value);

const isKnown = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

function points(maxPoints: number, ratio: number) {
  return Number((maxPoints * clamp(ratio, 0, 1)).toFixed(2));
}

function check(input: ScoreCheck): ScoreCheck {
  return {
    ...input,
    points: Number(input.points.toFixed(2)),
  };
}

function unknownCheck(
  id: string,
  label: string,
  maxPoints: number,
  message: string,
  criticalUnknown = false,
): ScoreCheck {
  return check({
    id,
    label,
    status: "unknown",
    points: points(maxPoints, UNKNOWN_CREDIT),
    maxPoints,
    message,
    criticalUnknown,
  });
}

function failCheck(
  id: string,
  label: string,
  maxPoints: number,
  message: string,
  blocker?: "build" | "data",
): ScoreCheck {
  return check({
    id,
    label,
    status: "fail",
    points: 0,
    maxPoints,
    message,
    blocker,
  });
}

function warningCheck(
  id: string,
  label: string,
  maxPoints: number,
  ratio: number,
  message: string,
): ScoreCheck {
  return check({
    id,
    label,
    status: "warning",
    points: points(maxPoints, ratio),
    maxPoints,
    message,
  });
}

function passCheck(
  id: string,
  label: string,
  maxPoints: number,
  message: string,
): ScoreCheck {
  return check({
    id,
    label,
    status: "pass",
    points: maxPoints,
    maxPoints,
    message,
  });
}

function category(label: string, checks: ScoreCheck[]): ScoreCategory {
  const earnedPoints = Number(
    checks.reduce((sum, item) => sum + item.points, 0).toFixed(2),
  );
  const maxPoints = Number(
    checks.reduce((sum, item) => sum + item.maxPoints, 0).toFixed(2),
  );

  return {
    label,
    score: maxPoints > 0 ? round((earnedPoints / maxPoints) * 100) : 0,
    earnedPoints,
    maxPoints,
    checks,
    blockers: checks
      .filter((item) => item.blocker)
      .map((item) => item.message),
    warnings: checks
      .filter((item) => item.status === "warning")
      .map((item) => item.message),
    strengths: checks
      .filter((item) => item.status === "pass")
      .map((item) => item.message),
    unknowns: checks
      .filter((item) => item.status === "unknown")
      .map((item) => item.message),
  };
}

function lotAreaSqft(input: CABNParcelScoringInput) {
  return (
    input.boundary?.usableAreaSqft ??
    input.boundary?.lotAreaSqft ??
    (isKnown(input.boundary?.lotAreaAcres)
      ? input.boundary.lotAreaAcres * SQFT_PER_ACRE
      : undefined)
  );
}

function minimumModelAreaSqft(models: CABNModel[]) {
  return Math.min(...models.map((model) => model.minimumLotAcres * SQFT_PER_ACRE));
}

function modelEnvelopeSqft(model: CABNModel) {
  return (
    (model.widthFt + model.requiredClearanceFt * 2) *
    (model.lengthFt + model.requiredClearanceFt * 2)
  );
}

function hasSepticOrSewer(input: CABNParcelScoringInput) {
  const sewer = input.utilities?.sewerAvailable;
  const septic = input.utilities?.septicLikely;

  if (sewer === true || septic === true) {
    return true;
  }

  if (sewer === false && septic === false) {
    return false;
  }

  return undefined;
}

function inferModelFits(
  input: CABNParcelScoringInput,
  models: CABNModel[],
): ModelFit[] {
  const areaSqft = lotAreaSqft(input);
  const roadWidth = input.physical?.minimumRoadWidthFt;
  const slope = input.topography?.slopePct;
  const maxFootprint = input.physical?.maxFootprintSqft;
  const minDwellingSize = input.regulatory?.minimumDwellingSizeSqft;
  const maxCoverage =
    isKnown(input.regulatory?.maxLotCoveragePct) && isKnown(areaSqft)
      ? areaSqft * (input.regulatory.maxLotCoveragePct / 100)
      : undefined;

  return models.map((model) => {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const strengths: string[] = [];
    let score = 55;

    if (isKnown(areaSqft)) {
      const minimumArea = model.minimumLotAcres * SQFT_PER_ACRE;
      const preferredArea = model.preferredLotAcres * SQFT_PER_ACRE;

      if (areaSqft < minimumArea) {
        blockers.push(`${model.name} needs at least ${model.minimumLotAcres} acres.`);
        score -= 70;
      } else if (areaSqft >= preferredArea) {
        strengths.push(`${model.name} has preferred lot area.`);
        score += 18;
      } else {
        warnings.push(`${model.name} fits minimum lot area but not preferred area.`);
        score += 4;
      }
    } else {
      warnings.push(`Lot area is unknown for ${model.name}.`);
      score -= 10;
    }

    if (isKnown(maxFootprint) && model.footprintSqft > maxFootprint) {
      blockers.push(`${model.name} exceeds the known maximum footprint.`);
      score -= 50;
    }

    if (isKnown(maxCoverage) && model.footprintSqft > maxCoverage) {
      blockers.push(`${model.name} exceeds known lot-coverage allowance.`);
      score -= 50;
    }

    if (isKnown(minDwellingSize) && model.sizeSqft < minDwellingSize) {
      blockers.push(
        `${model.name} is below the known minimum dwelling size of ${minDwellingSize} sq ft.`,
      );
      score -= 70;
    }

    if (isKnown(slope)) {
      if (slope > model.maximumSlopePct) {
        blockers.push(`${model.name} exceeds CABN slope tolerance.`);
        score -= 65;
      } else if (slope <= model.maximumSlopePct * 0.55) {
        strengths.push(`${model.name} is within preferred slope tolerance.`);
        score += 10;
      } else {
        warnings.push(`${model.name} may need additional foundation engineering.`);
        score -= 5;
      }
    }

    if (isKnown(roadWidth)) {
      if (roadWidth < model.minimumRoadWidthFt) {
        warnings.push(`${model.name} may have delivery constraints on the access road.`);
        score -= 12;
      } else {
        strengths.push(`${model.name} has enough known delivery width.`);
        score += 5;
      }
    }

    if (input.physical?.transportationFeasible === false) {
      blockers.push(`${model.name} cannot be delivered with known transportation constraints.`);
      score -= 70;
    }

    if (input.physical?.craneOrTruckAccess === false) {
      warnings.push(`${model.name} needs crane/truck access review.`);
      score -= 12;
    }

    if (input.utilities?.utilityPathFeasible === false) {
      blockers.push(`${model.name} has no known feasible utility or septic path.`);
      score -= 80;
    }

    return {
      model,
      score: round(clamp(score, 0, 100)),
      blockers,
      warnings,
      strengths,
    };
  });
}

function geometryCategory(
  input: CABNParcelScoringInput,
  models: CABNModel[],
) {
  const boundary = input.boundary;
  const areaSqft = lotAreaSqft(input);
  const minAreaSqft = minimumModelAreaSqft(models);
  const checks: ScoreCheck[] = [];

  if (boundary?.exists === true || boundary?.geometry) {
    checks.push(passCheck("geometry.boundary", "Parcel boundary", 4, "Parcel geometry is available."));
  } else if (boundary?.exists === false) {
    checks.push(
      failCheck(
        "geometry.boundary",
        "Parcel boundary",
        4,
        "Parcel geometry is missing; CABN cannot verify a build envelope.",
        "data",
      ),
    );
  } else {
    checks.push(
      unknownCheck(
        "geometry.boundary",
        "Parcel boundary",
        4,
        "Parcel boundary data is unknown.",
        true,
      ),
    );
  }

  if (isKnown(areaSqft)) {
    if (areaSqft < minAreaSqft) {
      checks.push(
        failCheck(
          "geometry.area",
          "Lot area",
          4,
          "Lot is too small for any CABN model.",
          "build",
        ),
      );
    } else {
      const preferredArea = models[models.length - 1].preferredLotAcres * SQFT_PER_ACRE;
      checks.push(
        areaSqft >= preferredArea
          ? passCheck("geometry.area", "Lot area", 4, "Lot area supports the full CABN model range.")
          : warningCheck(
              "geometry.area",
              "Lot area",
              4,
              0.72,
              "Lot area supports smaller CABN models but may constrain larger models.",
            ),
      );
    }
  } else {
    checks.push(
      unknownCheck("geometry.area", "Lot area", 4, "Lot area is unknown.", true),
    );
  }

  if (isKnown(boundary?.usableAreaSqft)) {
    checks.push(
      boundary.usableAreaSqft >= minAreaSqft
        ? passCheck("geometry.usableArea", "Usable lot size", 3, "Usable area supports a CABN envelope.")
        : failCheck(
            "geometry.usableArea",
            "Usable lot size",
            3,
            "Known usable area is too small for CABN placement.",
            "build",
          ),
    );
  } else {
    checks.push(
      unknownCheck(
        "geometry.usableArea",
        "Usable lot size",
        3,
        "Usable lot area is not confirmed.",
        true,
      ),
    );
  }

  const shape = boundary?.shape;
  if (!shape || shape === "unknown") {
    checks.push(unknownCheck("geometry.shape", "Parcel shape", 2, "Parcel shape is unknown."));
  } else if (shape === "regular") {
    checks.push(passCheck("geometry.shape", "Parcel shape", 2, "Parcel shape appears build-friendly."));
  } else if (shape === "irregular" || shape === "flag") {
    checks.push(
      warningCheck(
        "geometry.shape",
        "Parcel shape",
        2,
        0.62,
        "Parcel shape may reduce the usable CABN envelope.",
      ),
    );
  } else {
    checks.push(
      warningCheck(
        "geometry.shape",
        "Parcel shape",
        2,
        0.42,
        "Narrow parcel shape may constrain delivery and setbacks.",
      ),
    );
  }

  if (isKnown(boundary?.roadFrontageFt)) {
    checks.push(
      boundary.roadFrontageFt >= 35
        ? passCheck("geometry.frontage", "Road frontage", 2, "Road frontage is strong for access planning.")
        : warningCheck(
            "geometry.frontage",
            "Road frontage",
            2,
            0.48,
            "Road frontage is limited and needs delivery review.",
          ),
    );
  } else {
    checks.push(unknownCheck("geometry.frontage", "Road frontage", 2, "Road frontage is unknown."));
  }

  if (boundary?.legalRoadAccess === true || boundary?.access === "legal") {
    checks.push(passCheck("geometry.access", "Access", 2, "Legal road access is indicated."));
  } else if (boundary?.legalRoadAccess === false || boundary?.access === "none") {
    checks.push(
      failCheck(
        "geometry.access",
        "Access",
        2,
        "No legal road access is known.",
        "build",
      ),
    );
  } else if (boundary?.access === "easement" || boundary?.access === "informal") {
    checks.push(
      warningCheck(
        "geometry.access",
        "Access",
        2,
        0.56,
        "Access exists but the legal right and delivery path need review.",
      ),
    );
  } else {
    checks.push(unknownCheck("geometry.access", "Access", 2, "Legal access is unknown.", true));
  }

  if (input.apn) {
    checks.push(passCheck("geometry.apn", "APN", 1.5, "APN or parcel identifier is available."));
  } else {
    checks.push(unknownCheck("geometry.apn", "APN", 1.5, "APN is not confirmed."));
  }

  if (boundary?.dimensionsKnown === true) {
    checks.push(passCheck("geometry.dimensions", "Dimensions", 1.5, "Parcel dimensions are known."));
  } else if (boundary?.dimensionsKnown === false) {
    checks.push(
      warningCheck(
        "geometry.dimensions",
        "Dimensions",
        1.5,
        0.32,
        "Parcel dimensions are not known.",
      ),
    );
  } else {
    checks.push(unknownCheck("geometry.dimensions", "Dimensions", 1.5, "Parcel dimensions are unknown."));
  }

  return category("Parcel Geometry", checks);
}

function physicalFitCategory(
  input: CABNParcelScoringInput,
  modelFits: ModelFit[],
) {
  const bestFit = modelFits[0];
  const checks: ScoreCheck[] = [];
  const areaSqft = lotAreaSqft(input);
  const possibleFits = modelFits.filter((fit) => fit.blockers.length === 0);

  if (possibleFits.length) {
    checks.push(
      passCheck(
        "physical.minimumFootprint",
        "Minimum footprint",
        3,
        `${possibleFits.length} CABN model(s) fit minimum footprint rules.`,
      ),
    );
  } else {
    checks.push(
      failCheck(
        "physical.minimumFootprint",
        "Minimum footprint",
        3,
        "No CABN model satisfies the current physical footprint rules.",
        "build",
      ),
    );
  }

  const maxFootprint = input.physical?.maxFootprintSqft;
  if (isKnown(maxFootprint)) {
    const largestAllowed = CABN_MODELS.filter(
      (model) => model.footprintSqft <= maxFootprint,
    ).at(-1);
    checks.push(
      largestAllowed
        ? passCheck(
            "physical.maximumFootprint",
            "Maximum footprint",
            2,
            `Known footprint limit supports up to ${largestAllowed.name}.`,
          )
        : failCheck(
            "physical.maximumFootprint",
            "Maximum footprint",
            2,
            "Known footprint limit is below every CABN model.",
            "build",
          ),
    );
  } else {
    checks.push(
      unknownCheck(
        "physical.maximumFootprint",
        "Maximum footprint",
        2,
        "Maximum allowed footprint is unknown.",
      ),
    );
  }

  if (bestFit && bestFit.blockers.length === 0) {
    checks.push(
      passCheck(
        "physical.modelDimensions",
        "CABN dimensions",
        2,
        `${bestFit.model.name} dimensions are the strongest provisional fit.`,
      ),
    );
  } else {
    checks.push(
      warningCheck(
        "physical.modelDimensions",
        "CABN dimensions",
        2,
        0.35,
        "CABN model dimensions need a verified build envelope.",
      ),
    );
  }

  if (isKnown(areaSqft) && bestFit) {
    const envelope = modelEnvelopeSqft(bestFit.model);
    checks.push(
      areaSqft >= envelope
        ? passCheck("physical.clearances", "Required clearances", 2, "Known lot area can support model clearances.")
        : failCheck(
            "physical.clearances",
            "Required clearances",
            2,
            "Known lot area cannot support required CABN clearances.",
            "build",
          ),
    );
  } else {
    checks.push(
      unknownCheck(
        "physical.clearances",
        "Required clearances",
        2,
        "Required CABN clearances need a measured envelope.",
        true,
      ),
    );
  }

  if (input.physical?.setbacksKnown === true) {
    checks.push(passCheck("physical.setbacks", "Setbacks", 2, "Setbacks are known enough for preliminary fit."));
  } else if (input.physical?.setbacksKnown === false) {
    checks.push(
      warningCheck(
        "physical.setbacks",
        "Setbacks",
        2,
        0.35,
        "Setbacks are not confirmed.",
      ),
    );
  } else {
    checks.push(unknownCheck("physical.setbacks", "Setbacks", 2, "Setbacks are unknown.", true));
  }

  if (input.physical?.foundationFeasible === true) {
    checks.push(passCheck("physical.foundation", "Foundation", 1.5, "Foundation feasibility is indicated."));
  } else if (input.physical?.foundationFeasible === false) {
    checks.push(
      failCheck(
        "physical.foundation",
        "Foundation",
        1.5,
        "Known foundation conditions are not feasible for CABN.",
        "build",
      ),
    );
  } else {
    checks.push(unknownCheck("physical.foundation", "Foundation", 1.5, "Foundation requirements need review."));
  }

  if (input.physical?.transportationFeasible === true) {
    checks.push(passCheck("physical.transport", "Transportation", 1.5, "Known transportation path supports delivery."));
  } else if (input.physical?.transportationFeasible === false) {
    checks.push(
      failCheck(
        "physical.transport",
        "Transportation",
        1.5,
        "Known transportation constraints prevent CABN delivery.",
        "build",
      ),
    );
  } else {
    checks.push(
      unknownCheck(
        "physical.transport",
        "Transportation",
        1.5,
        "Transportation route has not been checked.",
      ),
    );
  }

  if (input.physical?.craneOrTruckAccess === true) {
    checks.push(passCheck("physical.craneTruck", "Crane/truck access", 1, "Truck or crane access is indicated."));
  } else if (input.physical?.craneOrTruckAccess === false) {
    checks.push(
      warningCheck(
        "physical.craneTruck",
        "Crane/truck access",
        1,
        0.2,
        "Crane or truck access is constrained.",
      ),
    );
  } else {
    checks.push(unknownCheck("physical.craneTruck", "Crane/truck access", 1, "Crane/truck access is unknown."));
  }

  return category("Physical Fit / CABN Rules", checks);
}

function topographyCategory(input: CABNParcelScoringInput, models: CABNModel[]) {
  const topo = input.topography;
  const checks: ScoreCheck[] = [];
  const strictestSlope = Math.min(...models.map((model) => model.maximumSlopePct));
  const broadSlope = Math.max(...models.map((model) => model.maximumSlopePct));
  const terrain = topo?.terrainDescription?.toLowerCase() ?? "";

  if (isKnown(topo?.slopePct)) {
    if (topo.slopePct > broadSlope) {
      checks.push(
        failCheck(
          "topography.slope",
          "Slope",
          5,
          "Slope is above CABN acceptable threshold.",
          "build",
        ),
      );
    } else if (topo.slopePct <= strictestSlope * 0.6) {
      checks.push(passCheck("topography.slope", "Slope", 5, "Slope is favorable for CABN placement."));
    } else {
      checks.push(
        warningCheck(
          "topography.slope",
          "Slope",
          5,
          0.58,
          "Slope may limit larger CABN models or increase foundation cost.",
        ),
      );
    }
  } else if (terrain.includes("steep") || terrain.includes("hillside")) {
    checks.push(
      warningCheck(
        "topography.slope",
        "Slope",
        5,
        0.38,
        "Terrain description suggests slope risk, but measured slope is unknown.",
      ),
    );
  } else {
    checks.push(unknownCheck("topography.slope", "Slope", 5, "Measured slope is unknown.", true));
  }

  if (isKnown(topo?.elevationFt)) {
    checks.push(passCheck("topography.elevation", "Elevation", 1.5, "Elevation is available for review."));
  } else {
    checks.push(unknownCheck("topography.elevation", "Elevation", 1.5, "Elevation is unknown."));
  }

  const aspect = topo?.aspect;
  if (aspect && aspect !== "unknown") {
    checks.push(passCheck("topography.aspect", "Aspect / solar orientation", 1.5, "Solar orientation is known."));
  } else {
    checks.push(
      unknownCheck(
        "topography.aspect",
        "Aspect / solar orientation",
        1.5,
        "Aspect and solar orientation are unknown.",
      ),
    );
  }

  if (topo?.drainage === "good") {
    checks.push(passCheck("topography.drainage", "Drainage", 3, "Drainage appears favorable."));
  } else if (topo?.drainage === "moderate") {
    checks.push(
      warningCheck(
        "topography.drainage",
        "Drainage",
        3,
        0.65,
        "Drainage needs site confirmation.",
      ),
    );
  } else if (topo?.drainage === "poor") {
    checks.push(
      warningCheck(
        "topography.drainage",
        "Drainage",
        3,
        0.18,
        "Poor drainage may increase site work.",
      ),
    );
  } else {
    checks.push(unknownCheck("topography.drainage", "Drainage", 3, "Drainage is unknown.", true));
  }

  const ridgelineRisk = topo?.ridgelineRisk;
  if (ridgelineRisk === "none" || ridgelineRisk === "low") {
    checks.push(passCheck("topography.ridgeline", "Ridgeline risk", 2, "Ridgeline risk appears low."));
  } else if (ridgelineRisk === "medium" || terrain.includes("ridge")) {
    checks.push(
      warningCheck(
        "topography.ridgeline",
        "Ridgeline risk",
        2,
        0.45,
        "Ridgeline or view-shed risk needs review.",
      ),
    );
  } else if (ridgelineRisk === "high" || ridgelineRisk === "extreme") {
    checks.push(
      warningCheck(
        "topography.ridgeline",
        "Ridgeline risk",
        2,
        0.18,
        "Ridgeline restrictions may create significant design risk.",
      ),
    );
  } else {
    checks.push(unknownCheck("topography.ridgeline", "Ridgeline risk", 2, "Ridgeline risk is unknown."));
  }

  if (topo?.cutFillComplexity === "Low") {
    checks.push(passCheck("topography.cutFill", "Cut/fill complexity", 2, "Cut/fill complexity appears low."));
  } else if (topo?.cutFillComplexity === "Medium") {
    checks.push(
      warningCheck(
        "topography.cutFill",
        "Cut/fill complexity",
        2,
        0.62,
        "Cut/fill complexity may affect budget.",
      ),
    );
  } else if (topo?.cutFillComplexity === "High") {
    checks.push(
      warningCheck(
        "topography.cutFill",
        "Cut/fill complexity",
        2,
        0.22,
        "High cut/fill complexity may materially affect feasibility.",
      ),
    );
  } else {
    checks.push(unknownCheck("topography.cutFill", "Cut/fill complexity", 2, "Cut/fill complexity is unknown."));
  }

  return category("Topography", checks);
}

function regulatoryCategory(input: CABNParcelScoringInput) {
  const regulatory = input.regulatory;
  const checks: ScoreCheck[] = [];

  if (regulatory?.zoningCompatibility === "compatible") {
    checks.push(passCheck("regulatory.zoning", "Zoning", 4, "Zoning appears compatible with CABN review."));
  } else if (regulatory?.zoningCompatibility === "conditional") {
    checks.push(
      warningCheck(
        "regulatory.zoning",
        "Zoning",
        4,
        0.58,
        "Zoning may allow CABN, but conditions or interpretations need review.",
      ),
    );
  } else if (regulatory?.zoningCompatibility === "incompatible") {
    checks.push(
      failCheck(
        "regulatory.zoning",
        "Zoning",
        4,
        "Zoning is explicitly incompatible with CABN placement.",
        "build",
      ),
    );
  } else {
    checks.push(unknownCheck("regulatory.zoning", "Zoning", 4, "Zoning compatibility is unknown.", true));
  }

  if (regulatory?.minimumSetbacksKnown === true) {
    checks.push(passCheck("regulatory.setbacks", "Minimum setbacks", 2, "Minimum setbacks are known."));
  } else if (regulatory?.minimumSetbacksKnown === false) {
    checks.push(
      warningCheck(
        "regulatory.setbacks",
        "Minimum setbacks",
        2,
        0.32,
        "Minimum setbacks have not been verified.",
      ),
    );
  } else {
    checks.push(unknownCheck("regulatory.setbacks", "Minimum setbacks", 2, "Minimum setbacks are unknown.", true));
  }

  if (isKnown(regulatory?.maxLotCoveragePct)) {
    checks.push(
      regulatory.maxLotCoveragePct >= 10
        ? passCheck("regulatory.coverage", "Maximum lot coverage", 2, "Lot coverage allowance appears adequate.")
        : warningCheck(
            "regulatory.coverage",
            "Maximum lot coverage",
            2,
            0.42,
            "Lot coverage allowance may constrain CABN placement.",
          ),
    );
  } else {
    checks.push(unknownCheck("regulatory.coverage", "Maximum lot coverage", 2, "Maximum lot coverage is unknown."));
  }

  if (isKnown(regulatory?.heightLimitFt)) {
    checks.push(
      regulatory.heightLimitFt >= 14
        ? passCheck("regulatory.height", "Height limits", 1.5, "Height limit appears compatible with CABN.")
        : warningCheck(
            "regulatory.height",
            "Height limits",
            1.5,
            0.4,
            "Height limit may constrain model selection.",
          ),
    );
  } else {
    checks.push(unknownCheck("regulatory.height", "Height limits", 1.5, "Height limit is unknown."));
  }

  if (isKnown(regulatory?.minimumDwellingSizeSqft)) {
    const smallestModel = Math.min(...CABN_MODELS.map((model) => model.sizeSqft));
    const largestModel = Math.max(...CABN_MODELS.map((model) => model.sizeSqft));

    if (regulatory.minimumDwellingSizeSqft > largestModel) {
      checks.push(
        failCheck(
          "regulatory.minimumDwelling",
          "Minimum dwelling size",
          2,
          "Minimum dwelling size is larger than every CABN model.",
          "build",
        ),
      );
    } else if (regulatory.minimumDwellingSizeSqft <= smallestModel) {
      checks.push(passCheck("regulatory.minimumDwelling", "Minimum dwelling size", 2, "Minimum dwelling size supports all CABN models."));
    } else {
      checks.push(
        warningCheck(
          "regulatory.minimumDwelling",
          "Minimum dwelling size",
          2,
          0.62,
          "Minimum dwelling size excludes smaller CABN models.",
        ),
      );
    }
  } else {
    checks.push(
      unknownCheck(
        "regulatory.minimumDwelling",
        "Minimum dwelling size",
        2,
        "Minimum dwelling size is unknown.",
        true,
      ),
    );
  }

  if (regulatory?.aduAllowed === true) {
    checks.push(passCheck("regulatory.adu", "ADU rules", 1.5, "ADU or compact dwelling rules appear favorable."));
  } else if (regulatory?.aduAllowed === false) {
    checks.push(
      warningCheck(
        "regulatory.adu",
        "ADU rules",
        1.5,
        0.28,
        "ADU or compact dwelling rules may not support CABN as proposed.",
      ),
    );
  } else {
    checks.push(unknownCheck("regulatory.adu", "ADU rules", 1.5, "ADU or compact dwelling rules are unknown."));
  }

  const overlays = regulatory?.overlayDistricts ?? [];
  if (!overlays.length) {
    checks.push(passCheck("regulatory.overlays", "Overlay districts", 1, "No overlay districts are known."));
  } else {
    checks.push(
      warningCheck(
        "regulatory.overlays",
        "Overlay districts",
        1,
        0.42,
        `Known overlay district(s) need review: ${overlays.join(", ")}.`,
      ),
    );
  }

  const fireSeverity = regulatory?.fireSeverity;
  if (fireSeverity === "none" || fireSeverity === "low") {
    checks.push(passCheck("regulatory.fire", "Fire severity", 1.5, "Fire severity risk appears low."));
  } else if (fireSeverity === "high" || fireSeverity === "extreme") {
    checks.push(
      warningCheck(
        "regulatory.fire",
        "Fire severity",
        1.5,
        fireSeverity === "extreme" ? 0 : 0.22,
        fireSeverity === "extreme"
          ? "Very High Fire Hazard Severity Zone; defensible-space, insurance, access, water, and permitting review recommended."
          : "High fire severity may require major mitigation.",
      ),
    );
  } else if (fireSeverity === "medium") {
    checks.push(warningCheck("regulatory.fire", "Fire severity", 1.5, 0.62, "Fire severity needs mitigation review."));
  } else {
    checks.push(unknownCheck("regulatory.fire", "Fire severity", 1.5, "Fire severity is unknown.", true));
  }

  const floodZone = regulatory?.floodZone;
  if (floodZone === "none") {
    checks.push(passCheck("regulatory.flood", "Flood zones", 2, "No flood zone risk is known."));
  } else if (floodZone === "floodway") {
    checks.push(
      failCheck(
        "regulatory.flood",
        "Flood zones",
        2,
        "Floodway constraint makes CABN permitting extremely unlikely.",
        "build",
      ),
    );
  } else if (floodZone === "floodplain" || floodZone === "moderate") {
    checks.push(
      warningCheck(
        "regulatory.flood",
        "Flood zones",
        2,
        0.28,
        "Flood-zone risk needs elevation and permitting review.",
      ),
    );
  } else {
    checks.push(unknownCheck("regulatory.flood", "Flood zones", 2, "Flood-zone status is unknown.", true));
  }

  const environmental = regulatory?.environmentalConstraint;
  if (environmental === "none" || environmental === "low") {
    checks.push(passCheck("regulatory.environmental", "Environmental constraints", 1, "No material environmental constraint is known."));
  } else if (environmental === "high" || environmental === "extreme") {
    checks.push(
      environmental === "extreme"
        ? failCheck(
            "regulatory.environmental",
            "Environmental constraints",
            1,
            "Environmental constraint makes CABN permitting extremely unlikely.",
            "build",
          )
        : warningCheck(
            "regulatory.environmental",
            "Environmental constraints",
            1,
            0.2,
            "Environmental constraints may materially affect permitting.",
          ),
    );
  } else if (environmental === "medium") {
    checks.push(
      warningCheck(
        "regulatory.environmental",
        "Environmental constraints",
        1,
        0.58,
        "Environmental constraints need review.",
      ),
    );
  } else {
    checks.push(unknownCheck("regulatory.environmental", "Environmental constraints", 1, "Environmental constraints are unknown."));
  }

  if (regulatory?.historicDistrict === false) {
    checks.push(passCheck("regulatory.historic", "Historic districts", 0.5, "Historic district risk is not indicated."));
  } else if (regulatory?.historicDistrict === true) {
    checks.push(
      warningCheck(
        "regulatory.historic",
        "Historic districts",
        0.5,
        0.18,
        "Historic district review may be required.",
      ),
    );
  } else {
    checks.push(unknownCheck("regulatory.historic", "Historic districts", 0.5, "Historic district status is unknown."));
  }

  if (regulatory?.coastalZone === false) {
    checks.push(passCheck("regulatory.coastal", "Coastal zones", 0.5, "Coastal-zone risk is not indicated."));
  } else if (regulatory?.coastalZone === true) {
    checks.push(
      failCheck(
        "regulatory.coastal",
        "Coastal zones",
        0.5,
        "Coastal-zone constraint makes CABN permitting extremely unlikely without specialist review.",
        "build",
      ),
    );
  } else {
    checks.push(unknownCheck("regulatory.coastal", "Coastal zones", 0.5, "Coastal-zone status is unknown."));
  }

  if (regulatory?.utilityEasements === "none" || regulatory?.utilityEasements === "minor") {
    checks.push(passCheck("regulatory.easements", "Utility easements", 0.5, "No major utility easement is known."));
  } else if (regulatory?.utilityEasements === "major") {
    checks.push(
      warningCheck(
        "regulatory.easements",
        "Utility easements",
        0.5,
        0.1,
        "Major utility easement may reduce buildable area.",
      ),
    );
  } else {
    checks.push(unknownCheck("regulatory.easements", "Utility easements", 0.5, "Utility easement status is unknown."));
  }

  return category("Regulatory", checks);
}

function utilitiesCategory(input: CABNParcelScoringInput) {
  const conditions = input.existingConditions;
  const utilities = input.utilities;
  const soil = conditions?.soil;
  const checks: ScoreCheck[] = [];

  if (conditions?.existingBuildings === false) {
    checks.push(passCheck("utilities.buildings", "Existing buildings", 2, "No existing building conflict is indicated."));
  } else if (conditions?.existingBuildings === true) {
    checks.push(
      warningCheck(
        "utilities.buildings",
        "Existing buildings",
        2,
        0.42,
        "Existing buildings may affect placement or demolition scope.",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.buildings", "Existing buildings", 2, "Existing building status is unknown."));
  }

  if (conditions?.drivewayExists === true) {
    checks.push(passCheck("utilities.driveway", "Driveways", 2, "Driveway access is indicated."));
  } else if (conditions?.drivewayExists === false) {
    checks.push(
      warningCheck(
        "utilities.driveway",
        "Driveways",
        2,
        0.42,
        "Driveway installation may be required.",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.driveway", "Driveways", 2, "Driveway status is unknown."));
  }

  if (conditions?.treeClearingLikely === false) {
    checks.push(passCheck("utilities.trees", "Trees", 2, "Tree clearing does not appear material."));
  } else if (conditions?.treeClearingLikely === true) {
    checks.push(
      warningCheck(
        "utilities.trees",
        "Trees",
        2,
        0.5,
        "Tree clearing may affect cost, layout, or permits.",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.trees", "Trees", 2, "Tree constraints are unknown."));
  }

  if (conditions?.poolPresent === false) {
    checks.push(passCheck("utilities.pools", "Pools", 1, "No pool conflict is indicated."));
  } else if (conditions?.poolPresent === true) {
    checks.push(
      warningCheck(
        "utilities.pools",
        "Pools",
        1,
        0.28,
        "Pool location may constrain CABN placement.",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.pools", "Pools", 1, "Pool status is unknown."));
  }

  if (soil?.available) {
    if (soil.drainageClass === "Excellent" || soil.drainageClass === "Good") {
      checks.push(passCheck("utilities.soilDrainage", "Soil drainage", 1, "USDA soils indicate favorable drainage."));
    } else if (soil.drainageClass === "Poor" || soil.drainageClass === "Very Poor") {
      checks.push(
        warningCheck(
          "utilities.soilDrainage",
          "Soil drainage",
          1,
          0.15,
          "USDA soils indicate poor drainage; foundation and site-work review recommended.",
        ),
      );
    } else {
      checks.push(
        warningCheck(
          "utilities.soilDrainage",
          "Soil drainage",
          1,
          0.55,
          "USDA soils indicate moderate or uncertain drainage.",
        ),
      );
    }

    if (soil.foundationSuitability === "Excellent" || soil.foundationSuitability === "Good") {
      checks.push(passCheck("utilities.soilFoundation", "Foundation soils", 1, "USDA soils appear favorable for light foundation review."));
    } else if (soil.foundationSuitability === "Poor") {
      checks.push(
        warningCheck(
          "utilities.soilFoundation",
          "Foundation soils",
          1,
          0.18,
          "USDA soils flag foundation suitability concerns; geotechnical review recommended.",
        ),
      );
    } else {
      checks.push(
        warningCheck(
          "utilities.soilFoundation",
          "Foundation soils",
          1,
          0.55,
          "USDA soils require foundation suitability confirmation.",
        ),
      );
    }

    if (soil.septicSuitability === "Excellent" || soil.septicSuitability === "Good") {
      checks.push(passCheck("utilities.soilSeptic", "Soil septic suitability", 1, "USDA soils appear supportive for septic screening."));
    } else if (soil.septicSuitability === "Poor") {
      checks.push(
        warningCheck(
          "utilities.soilSeptic",
          "Soil septic suitability",
          1,
          0.15,
          "USDA soils indicate poor septic suitability; septic feasibility review recommended.",
        ),
      );
    } else {
      checks.push(
        warningCheck(
          "utilities.soilSeptic",
          "Soil septic suitability",
          1,
          0.55,
          "USDA soils leave septic suitability uncertain.",
        ),
      );
    }
  } else {
    checks.push(unknownCheck("utilities.soils", "Soils", 3, "USDA soil suitability is unknown."));
  }

  if (utilities?.utilitiesKnown === true) {
    checks.push(passCheck("utilities.known", "Utilities", 1.5, "Utility availability is known."));
  } else if (utilities?.utilitiesKnown === false) {
    checks.push(
      warningCheck(
        "utilities.known",
        "Utilities",
        1.5,
        0.28,
        "Utility availability is not verified.",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.known", "Utilities", 1.5, "Utility availability is unknown.", true));
  }

  if (utilities?.powerAvailable === true) {
    checks.push(passCheck("utilities.power", "Power availability", 2.5, "Power is available or strongly indicated."));
  } else if (utilities?.powerAvailable === false) {
    checks.push(
      warningCheck(
        "utilities.power",
        "Power availability",
        2.5,
        0.22,
        "Power path is not available or not indicated.",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.power", "Power availability", 2.5, "Power availability is unknown.", true));
  }

  if (utilities?.waterAvailable === true) {
    checks.push(passCheck("utilities.water", "Water", 2, "Water path is available or strongly indicated."));
  } else if (utilities?.waterAvailable === false) {
    checks.push(
      warningCheck(
        "utilities.water",
        "Water",
        2,
        0.22,
        "Water path is not available or not indicated.",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.water", "Water", 2, "Water availability is unknown.", true));
  }

  if (utilities?.sewerAvailable === true) {
    checks.push(passCheck("utilities.sewer", "Sewer", 2, "Sewer path is available or strongly indicated."));
  } else if (utilities?.sewerAvailable === false) {
    checks.push(
      warningCheck(
        "utilities.sewer",
        "Sewer",
        2,
        0.3,
        "Sewer is not available; septic feasibility must carry the wastewater path.",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.sewer", "Sewer", 2, "Sewer availability is unknown."));
  }

  const septicOrSewer = hasSepticOrSewer(input);
  if (septicOrSewer === true) {
    checks.push(passCheck("utilities.septic", "Septic likelihood", 1.5, "Septic or sewer path is indicated."));
  } else if (septicOrSewer === false) {
    checks.push(
      failCheck(
        "utilities.septic",
        "Septic likelihood",
        1.5,
        "No feasible sewer or septic path is known.",
        "build",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.septic", "Septic likelihood", 1.5, "Septic or sewer feasibility is unknown.", true));
  }

  if (utilities?.roadAccessConfirmed === true) {
    checks.push(passCheck("utilities.roadAccess", "Road access", 0.5, "Road access is confirmed for utilities and delivery."));
  } else if (utilities?.roadAccessConfirmed === false) {
    checks.push(
      failCheck(
        "utilities.roadAccess",
        "Road access",
        0.5,
        "Road access is not confirmed.",
        "build",
      ),
    );
  } else {
    checks.push(unknownCheck("utilities.roadAccess", "Road access", 0.5, "Road access confirmation is unknown."));
  }

  if (utilities?.utilityPathFeasible === false) {
    checks.push(
      failCheck(
        "utilities.path",
        "Feasible utility path",
        0,
        "No feasible utility or septic path is known.",
        "build",
      ),
    );
  }

  return category("Existing Conditions / Utilities", checks);
}

function complexityCategory(
  input: CABNParcelScoringInput,
  dataCompleteness: number,
  unknownCount: number,
) {
  const checks: ScoreCheck[] = [];
  const permitting = input.complexity?.permittingComplexity;
  const siteWork = input.complexity?.siteWorkComplexity;

  if (permitting === "Low") {
    checks.push(passCheck("complexity.permitting", "Permitting complexity", 2, "Permitting complexity appears low."));
  } else if (permitting === "Medium") {
    checks.push(
      warningCheck(
        "complexity.permitting",
        "Permitting complexity",
        2,
        0.62,
        "Permitting complexity appears moderate.",
      ),
    );
  } else if (permitting === "High") {
    checks.push(
      warningCheck(
        "complexity.permitting",
        "Permitting complexity",
        2,
        0.22,
        "Permitting complexity appears high.",
      ),
    );
  } else {
    checks.push(unknownCheck("complexity.permitting", "Permitting complexity", 2, "Permitting complexity is unknown."));
  }

  if (siteWork === "Low") {
    checks.push(passCheck("complexity.siteWork", "Site work complexity", 2, "Site-work complexity appears low."));
  } else if (siteWork === "Medium") {
    checks.push(
      warningCheck(
        "complexity.siteWork",
        "Site work complexity",
        2,
        0.62,
        "Site-work complexity appears moderate.",
      ),
    );
  } else if (siteWork === "High") {
    checks.push(
      warningCheck(
        "complexity.siteWork",
        "Site work complexity",
        2,
        0.22,
        "Site-work complexity appears high.",
      ),
    );
  } else {
    checks.push(unknownCheck("complexity.siteWork", "Site work complexity", 2, "Site-work complexity is unknown."));
  }

  if (dataCompleteness >= 0.82) {
    checks.push(passCheck("complexity.data", "Data completeness", 2, "Data completeness is strong for preliminary scoring."));
  } else if (dataCompleteness >= 0.58) {
    checks.push(
      warningCheck(
        "complexity.data",
        "Data completeness",
        2,
        0.62,
        "Data completeness is moderate; diligence should focus on unknowns.",
      ),
    );
  } else {
    checks.push(
      warningCheck(
        "complexity.data",
        "Data completeness",
        2,
        0.25,
        "Data completeness is low; score should be treated as preliminary.",
      ),
    );
  }

  if (unknownCount <= 4) {
    checks.push(passCheck("complexity.confidence", "Confidence level", 2, "Few unknowns remain."));
  } else if (unknownCount <= 12) {
    checks.push(
      warningCheck(
        "complexity.confidence",
        "Confidence level",
        2,
        0.6,
        "Several unknowns remain.",
      ),
    );
  } else {
    checks.push(
      warningCheck(
        "complexity.confidence",
        "Confidence level",
        2,
        0.22,
        "Many critical unknowns remain.",
      ),
    );
  }

  checks.push(passCheck("complexity.nextSteps", "Recommended next steps", 2, "Next diligence steps can be generated from the scoring output."));

  return category("Cost / Complexity / Confidence", checks);
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function flattenCategories(categories: ScoreCategory[]) {
  return {
    blockers: unique(categories.flatMap((item) => item.blockers)),
    warnings: unique(categories.flatMap((item) => item.warnings)),
    strengths: unique(categories.flatMap((item) => item.strengths)),
    unknowns: unique(categories.flatMap((item) => item.unknowns)),
  };
}

function resolvePermittingComplexity(input: CABNParcelScoringInput): ComplexityLevel {
  const regulatory = input.regulatory;
  if (
    regulatory?.zoningCompatibility === "incompatible" ||
    regulatory?.floodZone === "floodway" ||
    regulatory?.coastalZone === true ||
    regulatory?.fireSeverity === "extreme" ||
    regulatory?.environmentalConstraint === "extreme"
  ) {
    return "High";
  }

  if (input.complexity?.permittingComplexity) {
    return input.complexity.permittingComplexity;
  }

  if (
    regulatory?.zoningCompatibility === "conditional" ||
    regulatory?.overlayDistricts?.length ||
    regulatory?.fireSeverity === "high" ||
    regulatory?.floodZone === "floodplain"
  ) {
    return "Medium";
  }

  if (regulatory?.zoningCompatibility === "compatible") {
    return "Low";
  }

  return "Unknown";
}

function resolveSiteComplexity(input: CABNParcelScoringInput): ComplexityLevel {
  if (input.complexity?.siteWorkComplexity) {
    return input.complexity.siteWorkComplexity;
  }

  if (
    input.topography?.slopePct !== undefined &&
    input.topography.slopePct !== null &&
    input.topography.slopePct > 15
  ) {
    return "High";
  }

  if (
    input.topography?.drainage === "poor" ||
    input.topography?.cutFillComplexity === "High" ||
    input.utilities?.utilityPathFeasible === false
  ) {
    return "High";
  }

  if (
    input.topography?.drainage === "moderate" ||
    input.topography?.cutFillComplexity === "Medium" ||
    input.existingConditions?.treeClearingLikely === true
  ) {
    return "Medium";
  }

  if (
    input.topography?.drainage === "good" &&
    input.utilities?.powerAvailable === true &&
    input.utilities?.waterAvailable === true
  ) {
    return "Low";
  }

  return "Unknown";
}

function confidenceFromData(dataCompleteness: number, criticalUnknowns: number) {
  if (dataCompleteness >= 0.82 && criticalUnknowns === 0) {
    return "High";
  }

  if (dataCompleteness >= 0.58 && criticalUnknowns <= 5) {
    return "Medium";
  }

  return "Low";
}

function ratingFor(totalScore: number, hasBuildBlocker: boolean): CABNRating {
  if (hasBuildBlocker) {
    return "Not Recommended";
  }

  if (totalScore >= 85) {
    return "Excellent";
  }

  if (totalScore >= 72) {
    return "Good";
  }

  if (totalScore >= 58) {
    return "Possible";
  }

  if (totalScore >= 40) {
    return "High Risk";
  }

  return "Not Recommended";
}

function nextStepsFor(input: {
  canBuild: CABNDecision;
  recommendedModel: CABNModel | null;
  blockers: string[];
  warnings: string[];
  unknowns: string[];
  permittingComplexity: ComplexityLevel;
  siteComplexity: ComplexityLevel;
}) {
  const steps: string[] = [];

  if (input.blockers.length) {
    steps.push("Resolve blocker items before presenting this parcel as CABN-buildable.");
  }

  if (input.unknowns.some((item) => item.toLowerCase().includes("parcel boundary"))) {
    steps.push("Order or retrieve parcel boundary geometry and a survey before final fit review.");
  }

  if (input.unknowns.some((item) => item.toLowerCase().includes("slope"))) {
    steps.push("Run slope/elevation analysis or request a topographic survey.");
  }

  if (input.unknowns.some((item) => item.toLowerCase().includes("zoning"))) {
    steps.push("Confirm zoning, allowed use, minimum dwelling size, and setbacks with the local authority.");
  }

  if (
    input.unknowns.some((item) => item.toLowerCase().includes("flood")) ||
    input.unknowns.some((item) => item.toLowerCase().includes("fire"))
  ) {
    steps.push("Check FEMA flood, fire severity, coastal, and environmental overlays.");
  }

  if (
    input.unknowns.some((item) => item.toLowerCase().includes("septic")) ||
    input.warnings.some((item) => item.toLowerCase().includes("septic"))
  ) {
    steps.push("Verify sewer availability or obtain a septic feasibility opinion.");
  }

  if (input.siteComplexity !== "Low") {
    steps.push("Price driveway, pad, delivery route, and utility trenching before offer.");
  }

  if (input.recommendedModel) {
    steps.push(`Use ${input.recommendedModel.name} as the provisional CABN match for site planning.`);
  }

  if (input.permittingComplexity !== "Low") {
    steps.push("Have Tony or a local permit specialist review permitting risk before buyer commitment.");
  }

  if (!steps.length) {
    steps.push("Proceed to CABN site plan, survey confirmation, and utility quotes.");
  }

  return unique(steps).slice(0, 7);
}

export function cabnCompatibilityScore(
  input: CABNParcelScoringInput,
  models = CABN_MODELS,
): CABNCompatibilityResult {
  const modelFits = inferModelFits(input, models).sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return b.model.sizeSqft - a.model.sizeSqft;
  });
  const possibleModelFits = modelFits.filter((fit) => fit.blockers.length === 0);
  const possibleModels = possibleModelFits.map((fit) => fit.model);
  const recommendedModel = possibleModels[0] ?? null;

  const geometry = geometryCategory(input, models);
  const physicalFit = physicalFitCategory(input, modelFits);
  const topography = topographyCategory(input, models);
  const regulatory = regulatoryCategory(input);
  const utilities = utilitiesCategory(input);
  const provisionalCategories = [
    geometry,
    physicalFit,
    topography,
    regulatory,
    utilities,
  ];
  const provisionalChecks = provisionalCategories.flatMap((item) => item.checks);
  const knownChecks = provisionalChecks.filter(
    (item) => item.status !== "unknown",
  ).length;
  const dataCompleteness =
    provisionalChecks.length > 0 ? knownChecks / provisionalChecks.length : 0;
  const unknownCount = provisionalChecks.filter(
    (item) => item.status === "unknown",
  ).length;
  const criticalUnknownCount = provisionalChecks.filter(
    (item) => item.criticalUnknown,
  ).length;
  const complexity = complexityCategory(input, dataCompleteness, unknownCount);
  const categories = [
    geometry,
    physicalFit,
    topography,
    regulatory,
    utilities,
    complexity,
  ];
  const allChecks = categories.flatMap((item) => item.checks);
  const hasBuildBlocker =
    allChecks.some((item) => item.blocker === "build") || possibleModels.length === 0;
  const hasDataBlocker = allChecks.some((item) => item.blocker === "data");
  const rawTotal = round(
    categories.reduce((sum, item) => sum + item.earnedPoints, 0),
  );
  const cappedTotal = hasBuildBlocker
    ? Math.min(rawTotal, 34)
    : hasDataBlocker
      ? Math.min(rawTotal, 56)
      : rawTotal;
  const totalScore = clamp(cappedTotal, 0, 100);
  const { blockers, warnings, strengths, unknowns } = flattenCategories(categories);
  const modelWarnings = unique(possibleModelFits.flatMap((fit) => fit.warnings));
  const modelStrengths = unique(possibleModelFits.flatMap((fit) => fit.strengths));
  const modelBlockers = possibleModels.length
    ? []
    : unique(modelFits.flatMap((fit) => fit.blockers));
  const canBuild: CABNDecision = hasBuildBlocker
    ? false
    : hasDataBlocker || criticalUnknownCount > 0
      ? "unknown"
      : true;
  const permittingComplexity = resolvePermittingComplexity(input);
  const siteComplexity = resolveSiteComplexity(input);
  const confidence = confidenceFromData(dataCompleteness, criticalUnknownCount);
  const mergedBlockers = unique([...blockers, ...modelBlockers]);
  const mergedWarnings = unique([...warnings, ...modelWarnings]);
  const mergedStrengths = unique([...strengths, ...modelStrengths]);

  return {
    totalScore,
    rating: ratingFor(totalScore, hasBuildBlocker),
    canBuild,
    recommendedModel,
    possibleModels,
    blockers: mergedBlockers,
    warnings: mergedWarnings,
    strengths: mergedStrengths,
    unknowns,
    categoryScores: {
      geometry,
      physicalFit,
      topography,
      regulatory,
      utilities,
      complexity,
    },
    permittingComplexity,
    siteComplexity,
    confidence,
    nextSteps: nextStepsFor({
      canBuild,
      recommendedModel,
      blockers: mergedBlockers,
      warnings: mergedWarnings,
      unknowns,
      permittingComplexity,
      siteComplexity,
    }),
  };
}

function parcelUtilityValue(parcel: Parcel, key: UtilityKey) {
  return parcel.provider === "regrid" || parcel.provider === "la_county_gis"
    ? undefined
    : parcel.utilities[key];
}

function isLiveParcelProvider(parcel: Parcel) {
  return parcel.provider === "regrid" || parcel.provider === "la_county_gis";
}

function inferAccess(parcel: Parcel): CABNAccessType {
  if (!parcel.roadAccess.available || parcel.roadAccess.type === "none") {
    return "none";
  }

  if (parcel.roadAccess.type === "easement") {
    return "easement";
  }

  return "legal";
}

function inferZoningCompatibility(parcel: Parcel): CABNZoningCompatibility {
  if (parcel.permitFriendliness === "friendly") {
    return "compatible";
  }

  if (parcel.permitFriendliness === "conditional") {
    return "conditional";
  }

  return "unknown";
}

function inferDrainage(parcel: Parcel) {
  const terrain = parcel.terrain.toLowerCase();

  if (terrain.includes("drainage") || terrain.includes("pasture") || terrain.includes("flat")) {
    return "moderate" as const;
  }

  return "unknown" as const;
}

export function buildCABNScoringInputFromParcel(
  parcel: Parcel,
  enrichment?: ParcelEnrichment,
): CABNParcelScoringInput {
  const acreage = enrichment?.details?.lotSizeAcres ?? parcel.acreage;
  const areaSqft = enrichment?.details?.lotSizeSqft ?? acreage * SQFT_PER_ACRE;
  const water = enrichment?.utilities?.water ?? parcelUtilityValue(parcel, "water");
  const electricity =
    enrichment?.utilities?.electricity ?? parcelUtilityValue(parcel, "electricity");
  const sewer = enrichment?.utilities?.sewerSeptic ?? parcelUtilityValue(parcel, "sewerSeptic");
  const access = inferAccess(parcel);
  const legalAccess =
    access === "none" ? false : isLiveParcelProvider(parcel) ? null : true;

  return {
    parcelId: parcel.id,
    apn: parcel.apn ?? parcel.providerParcelId,
    boundary: {
      exists: Boolean(parcel.geometry),
      geometry: parcel.geometry,
      lotAreaAcres: acreage,
      lotAreaSqft: areaSqft,
      usableAreaSqft: undefined,
      shape: "unknown",
      roadFrontageFt: undefined,
      access,
      legalRoadAccess: legalAccess,
      dimensionsKnown: Boolean(parcel.geometry) ? null : false,
    },
    physical: {
      maxFootprintSqft: undefined,
      setbacksKnown: null,
      foundationFeasible: null,
      transportationFeasible: null,
      craneOrTruckAccess: null,
      minimumRoadWidthFt: undefined,
    },
    topography: {
      slopePct: undefined,
      elevationFt: undefined,
      aspect: "unknown",
      drainage: inferDrainage(parcel),
      ridgelineRisk:
        parcel.terrain.toLowerCase().includes("ridge") ||
        parcel.terrain.toLowerCase().includes("hilltop")
          ? "medium"
          : "unknown",
      cutFillComplexity:
        parcel.terrain.toLowerCase().includes("steep") ||
        parcel.terrain.toLowerCase().includes("hillside")
          ? "High"
          : "Unknown",
      terrainDescription: parcel.terrain,
      ...usgsTopoToCABNTopography(enrichment?.topography),
    },
    regulatory: {
      zoningCompatibility: inferZoningCompatibility(parcel),
      zoningSummary: parcel.zoningSummary,
      minimumSetbacksKnown: null,
      maxLotCoveragePct: undefined,
      heightLimitFt: undefined,
      minimumDwellingSizeSqft: undefined,
      aduAllowed: null,
      overlayDistricts: [],
      fireSeverity: fireRiskToCABNRiskLevel(enrichment?.fireRisk),
      floodZone: floodRiskToCABNZone(enrichment?.floodRisk),
      environmentalConstraint: "unknown",
      historicDistrict: null,
      coastalZone: null,
      utilityEasements: "unknown",
    },
    existingConditions: {
      existingBuildings: enrichment?.propertyFeatures?.buildingSqft
        ? enrichment.propertyFeatures.buildingSqft > 0
        : null,
      drivewayExists: null,
      treeClearingLikely: parcel.terrain.toLowerCase().includes("tree")
        ? true
        : null,
      poolPresent: null,
      soil: enrichment?.soil,
    },
    utilities: {
      utilitiesKnown: isLiveParcelProvider(parcel) ? false : true,
      powerAvailable: electricity,
      waterAvailable: water,
      sewerAvailable: sewer,
      septicLikely: sewer,
      utilityPathFeasible:
        water === false && electricity === false && sewer === false ? false : null,
      roadAccessConfirmed: legalAccess,
    },
    complexity: {
      permittingComplexity:
        parcel.zoningRisk === "low"
          ? "Low"
          : parcel.zoningRisk === "medium"
            ? "Medium"
            : "High",
      siteWorkComplexity:
        soilToSiteComplexity(enrichment?.soil) ??
        (parcel.estimatedSiteWork.length > 3 || parcel.zoningRisk === "high"
          ? "High"
          : parcel.estimatedSiteWork.length > 1
            ? "Medium"
            : "Unknown"),
    },
  };
}
