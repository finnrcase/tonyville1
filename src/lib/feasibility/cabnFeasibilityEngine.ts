import type { CABNModel } from "@/lib/cabnModels";
import {
  cabnRectanglePolygon,
  minClearanceFeet,
  minDistanceToBoundaryFeet,
  type CABNPlacement,
  type YardGeometry,
} from "@/lib/yardGeometry";
import type { SelectedLot } from "@/lib/placeRoom";
import type { YardFitResult } from "@/lib/scoring/yardFitScore";
import {
  feasibilityRulesConfig,
  type FeasibilityResult,
  type FeasibilityRuleResult,
  type FeasibilityRulesConfig,
  type FeasibilityStatus,
} from "@/lib/feasibility/feasibilityRulesConfig";

export type { FeasibilityResult, FeasibilityRuleResult, FeasibilityStatus };

export type JurisdictionStatus = "supported" | "unknown" | "unsupported";

export type CABNFeasibilityInput = {
  lot?: SelectedLot | null;
  model: CABNModel;
  placement?: CABNPlacement;
  placementResult?: YardFitResult;
  existingStructures?: YardGeometry[];
  existingStructuresAvailable?: boolean;
  slopePercent?: number;
  utilityDistanceFeet?: number;
  deliveryWidthFeet?: number;
  jurisdictionStatus?: JurisdictionStatus;
};

function result(input: FeasibilityRuleResult): FeasibilityRuleResult {
  return input;
}

function unknownRule(ruleId: string, label: string, message: string): FeasibilityRuleResult {
  return result({
    ruleId,
    label,
    status: "needs_review",
    message,
    confidence: "low",
  });
}

function hasBlocker(input: CABNFeasibilityInput, pattern: string) {
  return Boolean(
    input.placementResult?.blockers.some((blocker) =>
      blocker.toLowerCase().includes(pattern),
    ),
  );
}

function slopeRule(
  input: CABNFeasibilityInput,
  config: FeasibilityRulesConfig,
): FeasibilityRuleResult {
  const slope = input.slopePercent;
  if (slope === undefined) {
    return unknownRule(
      "topography_slope",
      "Topography / slope",
      "Slope is not confirmed yet. Review during project confirmation before accepting with high confidence.",
    );
  }

  if (slope > config.slope.red.minPercent) {
    return result({
      ruleId: "topography_slope",
      label: "Topography / slope",
      status: "unlikely",
      message: `Slope is above ${config.slope.red.minPercent}%, which exceeds the current CABN reservation threshold.`,
      confidence: "medium",
      evidence: { slopePercent: slope },
    });
  }

  if (slope > config.slope.green.maxPercent) {
    return result({
      ruleId: "topography_slope",
      label: "Topography / slope",
      status: "needs_review",
      message: `Slope is between ${config.slope.yellow.minPercent}% and ${config.slope.yellow.maxPercent}%; confirmation visit should review grading and foundation approach.`,
      confidence: "medium",
      evidence: { slopePercent: slope },
    });
  }

  return result({
    ruleId: "topography_slope",
    label: "Topography / slope",
    status: "likely",
    message: `Slope is at or below ${config.slope.green.maxPercent}%.`,
    confidence: "medium",
    evidence: { slopePercent: slope },
  });
}

function buildAreaRule(
  input: CABNFeasibilityInput,
  config: FeasibilityRulesConfig,
): FeasibilityRuleResult {
  const usable = input.placementResult?.usableYardSqft;
  if (usable === undefined) {
    return unknownRule(
      "available_build_area",
      "Available build area",
      "Clear build area is not confirmed from current data.",
    );
  }

  const ratio = usable / input.model.squareFeet;
  if (ratio < config.buildArea.red.maxUsableAreaMultiplier) {
    return result({
      ruleId: "available_build_area",
      label: "Available build area",
      status: "unlikely",
      message: "Available area appears too constrained for a confident Project Reservation.",
      confidence: "medium",
      evidence: { usableYardSqft: usable, roomSqft: input.model.squareFeet, ratio },
    });
  }

  if (ratio < config.buildArea.green.minUsableAreaMultiplier) {
    return result({
      ruleId: "available_build_area",
      label: "Available build area",
      status: "needs_review",
      message: "A room may fit, but the clear area is tight enough to require review.",
      confidence: "medium",
      evidence: { usableYardSqft: usable, roomSqft: input.model.squareFeet, ratio },
    });
  }

  return result({
    ruleId: "available_build_area",
    label: "Available build area",
    status: "likely",
    message: "Current placement leaves a reasonable clear area for this room.",
    confidence: "medium",
    evidence: { usableYardSqft: usable, roomSqft: input.model.squareFeet, ratio },
  });
}

function setbackRule(
  input: CABNFeasibilityInput,
  config: FeasibilityRulesConfig,
): FeasibilityRuleResult {
  if (hasBlocker(input, "setback")) {
    return result({
      ruleId: "setbacks",
      label: "Setbacks",
      status: "unlikely",
      message: "Current placement appears to violate the early-screening setback rule.",
      confidence: "medium",
      evidence: { blockers: input.placementResult?.blockers },
    });
  }

  if (!input.lot?.boundary || !input.placement) {
    return unknownRule(
      "setbacks",
      "Setbacks",
      "Setback distance cannot be calculated without boundary and placement data.",
    );
  }

  const distance = minDistanceToBoundaryFeet(
    cabnRectanglePolygon(input.model, input.placement),
    input.lot.boundary,
  );
  if (distance === undefined) {
    return unknownRule(
      "setbacks",
      "Setbacks",
      "Setback distance could not be calculated from current geometry.",
    );
  }

  if (distance <= config.setback.red.maxFeet) {
    return result({
      ruleId: "setbacks",
      label: "Setbacks",
      status: "unlikely",
      message: "Room footprint touches or crosses the lot boundary.",
      confidence: "medium",
      evidence: { distanceFeet: distance },
    });
  }

  if (distance < config.setback.green.minFeet) {
    return result({
      ruleId: "setbacks",
      label: "Setbacks",
      status: "needs_review",
      message: `Room is inside the ${config.setback.green.minFeet} ft placeholder setback buffer.`,
      confidence: "medium",
      evidence: { distanceFeet: distance },
    });
  }

  return result({
    ruleId: "setbacks",
    label: "Setbacks",
    status: "likely",
    message: "Room clears the placeholder setback threshold.",
    confidence: "medium",
    evidence: { distanceFeet: distance },
  });
}

function deliveryRule(
  input: CABNFeasibilityInput,
  config: FeasibilityRulesConfig,
): FeasibilityRuleResult {
  const width = input.deliveryWidthFeet;
  if (width === undefined) {
    return unknownRule(
      "access_deliverability",
      "Access / deliverability",
      "Driveway and delivery width are not confirmed yet.",
    );
  }

  if (width < config.deliveryWidth.red.maxFeet) {
    return result({
      ruleId: "access_deliverability",
      label: "Access / deliverability",
      status: "unlikely",
      message: `Delivery width is below ${config.deliveryWidth.red.maxFeet} ft.`,
      confidence: "medium",
      evidence: { deliveryWidthFeet: width },
    });
  }

  if (width < config.deliveryWidth.green.minFeet) {
    return result({
      ruleId: "access_deliverability",
      label: "Access / deliverability",
      status: "needs_review",
      message: "Delivery width is tight and should be reviewed before reservation confidence.",
      confidence: "medium",
      evidence: { deliveryWidthFeet: width },
    });
  }

  return result({
    ruleId: "access_deliverability",
    label: "Access / deliverability",
    status: "likely",
    message: "Delivery width meets the current threshold.",
    confidence: "medium",
    evidence: { deliveryWidthFeet: width },
  });
}

function utilitiesRule(
  input: CABNFeasibilityInput,
  config: FeasibilityRulesConfig,
): FeasibilityRuleResult {
  const distance = input.utilityDistanceFeet;
  if (distance === undefined) {
    return unknownRule(
      "utilities",
      "Utilities",
      "Utility distance is not confirmed yet.",
    );
  }

  if (distance > config.utilityDistance.red.minFeet) {
    return result({
      ruleId: "utilities",
      label: "Utilities",
      status: "unlikely",
      message: `Utility tie-in appears farther than ${config.utilityDistance.red.minFeet} ft.`,
      confidence: "medium",
      evidence: { utilityDistanceFeet: distance },
    });
  }

  if (distance > config.utilityDistance.green.maxFeet) {
    return result({
      ruleId: "utilities",
      label: "Utilities",
      status: "needs_review",
      message: "Utility distance is workable only after cost and routing review.",
      confidence: "medium",
      evidence: { utilityDistanceFeet: distance },
    });
  }

  return result({
    ruleId: "utilities",
    label: "Utilities",
    status: "likely",
    message: "Utility tie-in distance is within the current preferred threshold.",
    confidence: "medium",
    evidence: { utilityDistanceFeet: distance },
  });
}

function existingImprovementsRule(input: CABNFeasibilityInput): FeasibilityRuleResult {
  if (!input.existingStructuresAvailable) {
    return unknownRule(
      "existing_improvements",
      "Existing improvements",
      "Existing structures or site improvements are not confirmed.",
    );
  }

  const count = input.existingStructures?.length ?? 0;
  return result({
    ruleId: "existing_improvements",
    label: "Existing improvements",
    status: count > 0 ? "needs_review" : "likely",
    message:
      count > 0
        ? "Known improvements are present; placement can proceed but should be confirmed on site."
        : "No known existing improvements conflict with the current screen.",
    confidence: "medium",
    evidence: { structureCount: count },
  });
}

function jurisdictionRule(
  input: CABNFeasibilityInput,
  config: FeasibilityRulesConfig,
): FeasibilityRuleResult {
  const status = input.jurisdictionStatus ?? "unknown";
  if (status === "unsupported") {
    return result({
      ruleId: "jurisdiction",
      label: "Jurisdiction",
      status: config.jurisdiction.unsupportedStatus,
      message: "Current jurisdiction is marked unsupported for reservation acceptance.",
      confidence: "high",
      evidence: { jurisdictionStatus: status, state: input.lot?.state },
    });
  }

  if (status === "supported") {
    return result({
      ruleId: "jurisdiction",
      label: "Jurisdiction",
      status: config.jurisdiction.supportedStatus,
      message: "Current jurisdiction is marked supported for this early CABN screen.",
      confidence: "medium",
      evidence: { jurisdictionStatus: status, state: input.lot?.state },
    });
  }

  return result({
    ruleId: "jurisdiction",
    label: "Jurisdiction",
    status: config.jurisdiction.unknownStatus,
    message: "Local jurisdiction, zoning, and permit pathway need confirmation.",
    confidence: "low",
    evidence: { jurisdictionStatus: status, state: input.lot?.state },
  });
}

function structureConflictRule(
  input: CABNFeasibilityInput,
  config: FeasibilityRulesConfig,
): FeasibilityRuleResult {
  if (hasBlocker(input, "overlaps an existing structure")) {
    return result({
      ruleId: "structure_conflict",
      label: "Structure conflict",
      status: "unlikely",
      message: "Room footprint overlaps a known structure.",
      confidence: "medium",
      evidence: { blockers: input.placementResult?.blockers },
    });
  }

  if (!input.placement) {
    return unknownRule(
      "structure_conflict",
      "Structure conflict",
      "Room placement has not been set.",
    );
  }

  if (!input.existingStructuresAvailable) {
    return unknownRule(
      "structure_conflict",
      "Structure conflict",
      "Structure data unavailable — placement requires verification.",
    );
  }

  const structures = input.existingStructures ?? [];
  if (!structures.length) {
    return result({
      ruleId: "structure_conflict",
      label: "Structure conflict",
      status: "likely",
      message: "No known structure conflict from available data.",
      confidence: "medium",
      evidence: { structureCount: 0 },
    });
  }

  const room = cabnRectanglePolygon(input.model, input.placement);
  const minClearance = Math.min(
    ...structures.map((structure) => minClearanceFeet(room, structure)),
  );

  if (minClearance < config.structureClearance.red.maxFeet) {
    return result({
      ruleId: "structure_conflict",
      label: "Structure conflict",
      status: "unlikely",
      message: `Room is within ${config.structureClearance.red.maxFeet} ft of a known structure.`,
      confidence: "medium",
      evidence: { minClearanceFeet: minClearance },
    });
  }

  if (minClearance < config.structureClearance.green.minFeet) {
    return result({
      ruleId: "structure_conflict",
      label: "Structure conflict",
      status: "needs_review",
      message: "Room clears hard structure conflict, but clearance is tight.",
      confidence: "medium",
      evidence: { minClearanceFeet: minClearance },
    });
  }

  return result({
    ruleId: "structure_conflict",
    label: "Structure conflict",
    status: "likely",
    message: "Room clears known structure conflict thresholds.",
    confidence: "medium",
    evidence: { minClearanceFeet: minClearance },
  });
}

function boundaryConfidenceRule(
  input: CABNFeasibilityInput,
  config: FeasibilityRulesConfig,
): FeasibilityRuleResult {
  if (!input.lot?.boundary) {
    return result({
      ruleId: "lot_boundary_confidence",
      label: "Lot boundary confidence",
      status: config.boundaryConfidence.missingBoundaryStatus,
      message: "No lot boundary is available for reservation screening.",
      confidence: "low",
    });
  }

  if (input.lot.boundaryIsEstimated) {
    return result({
      ruleId: "lot_boundary_confidence",
      label: "Lot boundary confidence",
      status: config.boundaryConfidence.estimatedBoundaryStatus,
      message: "Lot boundary is estimated and needs confirmation.",
      confidence: "low",
    });
  }

  return result({
    ruleId: "lot_boundary_confidence",
    label: "Lot boundary confidence",
    status: "likely",
    message: "A parcel boundary is available for early screening.",
    confidence: "medium",
  });
}

function placementValidityRule(
  input: CABNFeasibilityInput,
  config: FeasibilityRulesConfig,
): FeasibilityRuleResult {
  if (!input.placementResult) {
    return unknownRule(
      "placement_validity",
      "Placement validity",
      "Room placement has not been evaluated.",
    );
  }

  if (!input.placementResult.validPlacement) {
    return result({
      ruleId: "placement_validity",
      label: "Placement validity",
      status: config.placementValidity.invalidStatus,
      message: "Current room placement fails early placement rules.",
      confidence: "medium",
      evidence: {
        blockers: input.placementResult.blockers,
        warnings: input.placementResult.warnings,
      },
    });
  }

  if (input.placementResult.unknowns.length > 0) {
    return result({
      ruleId: "placement_validity",
      label: "Placement validity",
      status: config.placementValidity.validWithUnknownsStatus,
      message: "Placement passes hard rules, but missing data requires review.",
      confidence: "medium",
      evidence: { unknowns: input.placementResult.unknowns },
    });
  }

  return result({
    ruleId: "placement_validity",
    label: "Placement validity",
    status: config.placementValidity.validStatus,
    message: "Placement passes current hard placement rules.",
    confidence: "high",
  });
}

function rollupStatus(rules: FeasibilityRuleResult[]): FeasibilityStatus {
  if (rules.some((rule) => rule.status === "unlikely")) return "unlikely";
  if (rules.some((rule) => rule.status === "needs_review")) return "needs_review";
  return "likely";
}

function summaryFor(status: FeasibilityStatus) {
  if (status === "likely") {
    return "Likely reservation candidate. The GUI has enough confidence to proceed, while certainty still belongs to the Project Confirmation Visit.";
  }

  if (status === "needs_review") {
    return "Needs review before CABN accepts the reservation with confidence. Missing or tight conditions should be checked by Tony/CABN.";
  }

  return "Unlikely reservation candidate from current rules. CABN should review before accepting payment or should route to refund/rejection workflow.";
}

export function evaluateCABNFeasibility(
  input: CABNFeasibilityInput,
  config = feasibilityRulesConfig,
): FeasibilityResult {
  const rules = [
    slopeRule(input, config),
    buildAreaRule(input, config),
    setbackRule(input, config),
    deliveryRule(input, config),
    utilitiesRule(input, config),
    existingImprovementsRule(input),
    jurisdictionRule(input, config),
    structureConflictRule(input, config),
    boundaryConfidenceRule(input, config),
    placementValidityRule(input, config),
  ];
  const overallStatus = rollupStatus(rules);

  return {
    overallStatus,
    summary: summaryFor(overallStatus),
    rules,
  };
}

export function feasibilityStatusLabel(status: FeasibilityStatus) {
  if (status === "likely") return "Likely";
  if (status === "needs_review") return "Needs Review";
  return "Unlikely";
}
