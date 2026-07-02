import { describe, expect, it } from "vitest";
import { getCabnModel } from "@/lib/cabnModels";
import { evaluateCABNFeasibility } from "@/lib/feasibility/cabnFeasibilityEngine";
import { feasibilityRulesConfig } from "@/lib/feasibility/feasibilityRulesConfig";
import { createEstimatedBoundary, type SelectedLot } from "@/lib/placeRoom";
import { yardFitScore } from "@/lib/scoring/yardFitScore";
import type { CABNPlacement } from "@/lib/yardGeometry";

const center = { lat: 34.0522, lng: -118.2437 };

function lot(overrides: Partial<SelectedLot> = {}): SelectedLot {
  const boundary = createEstimatedBoundary({
    lat: center.lat,
    lng: center.lng,
    lotSizeSqFt: 40000,
  });

  return {
    id: "test-lot",
    source: "owned_property",
    title: "Test lot",
    lat: center.lat,
    lng: center.lng,
    lotSizeSqFt: 40000,
    acreage: 40000 / 43560,
    boundary,
    boundaryIsEstimated: false,
    structures: [],
    structuresAvailable: true,
    ...overrides,
  };
}

function placement(overrides: Partial<CABNPlacement> = {}): CABNPlacement {
  return {
    center: { lng: center.lng, lat: center.lat },
    rotationDeg: 0,
    ...overrides,
  };
}

function likelyPlacementResult(inputLot = lot(), inputPlacement = placement()) {
  const model = getCabnModel("cabn-160");

  return yardFitScore({
    parcelGeometry: inputLot.boundary,
    existingStructures: [],
    existingStructuresAvailable: true,
    accessPathKnown: true,
    utilityTieInLikely: true,
    model,
    placement: inputPlacement,
  });
}

describe("evaluateCABNFeasibility", () => {
  it("returns Likely when all reservation-screening rules are favorable", () => {
    const inputLot = lot();
    const model = getCabnModel("cabn-160");
    const inputPlacement = placement();
    const placementResult = likelyPlacementResult(inputLot, inputPlacement);

    const result = evaluateCABNFeasibility({
      lot: inputLot,
      model,
      placement: inputPlacement,
      placementResult,
      existingStructures: [],
      existingStructuresAvailable: true,
      slopePercent: 4,
      utilityDistanceFeet: 25,
      deliveryWidthFeet: 12,
      jurisdictionStatus: "supported",
    });

    expect(result.overallStatus).toBe("likely");
    expect(result.rules).toHaveLength(10);
    expect(result.rules.every((rule) => rule.status === "likely")).toBe(true);
  });

  it("returns Needs Review for unknowns without pretending certainty", () => {
    const inputLot = lot({ boundaryIsEstimated: true, structuresAvailable: false });
    const model = getCabnModel("cabn-160");
    const inputPlacement = placement();
    const placementResult = yardFitScore({
      parcelGeometry: inputLot.boundary,
      existingStructures: [],
      existingStructuresAvailable: false,
      model,
      placement: inputPlacement,
    });

    const result = evaluateCABNFeasibility({
      lot: inputLot,
      model,
      placement: inputPlacement,
      placementResult,
      existingStructures: [],
      existingStructuresAvailable: false,
      jurisdictionStatus: "unknown",
    });

    expect(result.overallStatus).toBe("needs_review");
    expect(result.rules.some((rule) => rule.status === "needs_review")).toBe(true);
    expect(
      result.rules.every((rule) =>
        ["likely", "needs_review", "unlikely"].includes(rule.status),
      ),
    ).toBe(true);
    expect(result.summary.toLowerCase()).not.toContain("buildable");
    expect(
      result.rules.some((rule) =>
        rule.message.toLowerCase().includes("project confirmation"),
      ),
    ).toBe(true);
  });

  it("returns Unlikely for hard placement blockers", () => {
    const inputLot = lot();
    const model = getCabnModel("cabn-160");
    const outsidePlacement = placement({
      center: { lng: center.lng + 0.01, lat: center.lat + 0.01 },
    });
    const placementResult = yardFitScore({
      parcelGeometry: inputLot.boundary,
      existingStructures: [],
      existingStructuresAvailable: true,
      accessPathKnown: true,
      utilityTieInLikely: true,
      model,
      placement: outsidePlacement,
    });

    const result = evaluateCABNFeasibility({
      lot: inputLot,
      model,
      placement: outsidePlacement,
      placementResult,
      existingStructures: [],
      existingStructuresAvailable: true,
      slopePercent: 4,
      utilityDistanceFeet: 25,
      deliveryWidthFeet: 12,
      jurisdictionStatus: "supported",
    });

    expect(result.overallStatus).toBe("unlikely");
    expect(result.rules.find((rule) => rule.ruleId === "placement_validity")?.status).toBe(
      "unlikely",
    );
  });

  it("uses editable threshold config rather than fixed utility limits", () => {
    const inputLot = lot();
    const model = getCabnModel("cabn-160");
    const inputPlacement = placement();
    const placementResult = likelyPlacementResult(inputLot, inputPlacement);
    const baseInput = {
      lot: inputLot,
      model,
      placement: inputPlacement,
      placementResult,
      existingStructures: [],
      existingStructuresAvailable: true,
      slopePercent: 4,
      utilityDistanceFeet: 90,
      deliveryWidthFeet: 12,
      jurisdictionStatus: "supported" as const,
    };

    const defaultResult = evaluateCABNFeasibility(baseInput);
    const stricterResult = evaluateCABNFeasibility(baseInput, {
      ...feasibilityRulesConfig,
      utilityDistance: {
        green: { maxFeet: 30 },
        yellow: { minFeet: 30, maxFeet: 80 },
        red: { minFeet: 80 },
      },
    });

    expect(defaultResult.rules.find((rule) => rule.ruleId === "utilities")?.status).toBe(
      "needs_review",
    );
    expect(stricterResult.rules.find((rule) => rule.ruleId === "utilities")?.status).toBe(
      "unlikely",
    );
  });
});
