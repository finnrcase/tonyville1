import type { CABNModel } from "@/lib/cabnModels";
import {
  cabnRectanglePolygon,
  minClearanceFeet,
  minDistanceToBoundaryFeet,
  polygonInsidePolygon,
  usableYardAreaSqft,
  type CABNPlacement,
  type YardGeometry,
} from "@/lib/yardGeometry";

export type YardFitResult = {
  status: "Likely Fits" | "Does Not Fit" | "Needs Review";
  score: number;
  validPlacement: boolean;
  confidence: "High" | "Medium" | "Low";
  usableYardSqft?: number;
  blockers: string[];
  warnings: string[];
  unknowns: string[];
  nextSteps: string[];
};

export type YardFitInput = {
  parcelGeometry?: YardGeometry;
  existingStructures?: YardGeometry[];
  existingStructuresAvailable?: boolean;
  placement?: CABNPlacement;
  model: CABNModel;
  accessPathKnown?: boolean;
  utilityTieInLikely?: boolean;
  setbackFt?: number;
};

// Hard clearance rule from the design: a CABN within this distance of an existing
// structure is invalid, regardless of the model's preferred clearance.
const MIN_STRUCTURE_CLEARANCE_FT = 5;

function scoreFor(input: {
  blockers: string[];
  warnings: string[];
  unknowns: string[];
}) {
  if (input.blockers.length > 0) {
    return Math.max(12, 48 - input.blockers.length * 12 - input.warnings.length * 5);
  }

  return Math.max(45, 92 - input.warnings.length * 7 - input.unknowns.length * 8);
}

function confidenceFor(unknownCount: number): YardFitResult["confidence"] {
  if (unknownCount >= 3) return "Low";
  if (unknownCount >= 1) return "Medium";
  return "High";
}

export function yardFitScore(input: YardFitInput): YardFitResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const unknowns: string[] = [];
  const nextSteps = [
    "Confirm zoning and ADU eligibility with the local planning department.",
    "Verify setbacks, easements, and utility route before final placement.",
    "Schedule Tony review before treating this as a buildable plan.",
  ];

  if (!input.parcelGeometry) {
    unknowns.push("Parcel boundary is unavailable.");
  }
  if (!input.placement) {
    unknowns.push("CABN placement has not been selected.");
  }

  const placementPolygon =
    input.placement && cabnRectanglePolygon(input.model, input.placement);

  if (input.parcelGeometry && placementPolygon) {
    if (!polygonInsidePolygon(placementPolygon, input.parcelGeometry)) {
      blockers.push("CABN footprint extends outside the parcel boundary.");
    }

    const setbackFt = input.setbackFt ?? input.model.defaultSetbackFt;
    const distance = minDistanceToBoundaryFeet(placementPolygon, input.parcelGeometry);
    if (distance === undefined) {
      unknowns.push("Setback buffer could not be calculated from parcel geometry.");
    } else if (distance < setbackFt) {
      blockers.push(
        `CABN footprint appears inside the ${setbackFt} ft early-screening setback buffer.`,
      );
    }
  }

  if (!input.existingStructuresAvailable) {
    unknowns.push("Existing structures unavailable — manual review needed.");
  } else if (placementPolygon) {
    const structures = input.existingStructures ?? [];
    let overlapped = false;
    let tooClose = false;
    let tightForModel = false;
    structures.forEach((structure) => {
      const clearance = minClearanceFeet(placementPolygon, structure);
      if (clearance === 0) overlapped = true;
      else if (clearance < MIN_STRUCTURE_CLEARANCE_FT) tooClose = true;
      else if (clearance < input.model.requiredClearanceFt) tightForModel = true;
    });
    if (overlapped) blockers.push("CABN footprint overlaps an existing structure.");
    if (tooClose) {
      blockers.push(
        `CABN footprint is within ${MIN_STRUCTURE_CLEARANCE_FT} ft of an existing structure.`,
      );
    }
    if (tightForModel) {
      warnings.push(
        `CABN is closer than the model's preferred ${input.model.requiredClearanceFt} ft clearance to a structure.`,
      );
    }
  }

  // Usable yard area (parcel minus footprint and any known structures).
  const usableYardSqft = usableYardAreaSqft(
    input.parcelGeometry,
    [
      ...(placementPolygon ? [placementPolygon] : []),
      ...(input.existingStructuresAvailable ? input.existingStructures ?? [] : []),
    ],
  );
  if (usableYardSqft !== undefined && usableYardSqft < input.model.squareFeet) {
    warnings.push("Very little usable yard remains after placement.");
  }

  if (!input.accessPathKnown) {
    unknowns.push("Access path is unavailable; delivery route needs manual review.");
  }

  if (input.utilityTieInLikely === undefined) {
    unknowns.push("Utility tie-in likelihood needs review.");
  } else if (!input.utilityTieInLikely) {
    warnings.push("Utility tie-in may be difficult; budget for a longer service run.");
  }

  if (input.model.squareFeet >= 480) {
    warnings.push("Larger CABN concept requires added delivery, foundation, and utility review.");
  }

  const score = scoreFor({ blockers, warnings, unknowns });
  const status =
    blockers.length > 0
      ? "Does Not Fit"
      : unknowns.length > 0
        ? "Needs Review"
        : "Likely Fits";

  return {
    status,
    score,
    validPlacement: blockers.length === 0 && Boolean(placementPolygon),
    confidence: confidenceFor(unknowns.length),
    usableYardSqft,
    blockers,
    warnings,
    unknowns,
    nextSteps,
  };
}
