import { describe, expect, it } from "vitest";
import {
  cabnCompatibilityScore,
  fireRiskToCABNRiskLevel,
  floodRiskToCABNZone,
  usgsTopoToCABNTopography,
  type CABNParcelScoringInput,
} from "@/lib/scoring/cabnCompatibilityScore";

describe("fireRiskToCABNRiskLevel", () => {
  it("maps CAL FIRE screening results without making unavailable data fatal", () => {
    expect(fireRiskToCABNRiskLevel(undefined)).toBe("unknown");
    expect(
      fireRiskToCABNRiskLevel({
        available: false,
        fireZone: "Unknown",
        riskLevel: "Unknown",
        confidence: "Low",
        source: "Unavailable",
        notes: [],
      }),
    ).toBe("unknown");
    expect(
      fireRiskToCABNRiskLevel({
        available: true,
        fireZone: "Very High",
        riskLevel: "Extreme",
        confidence: "High",
        source: "CAL FIRE",
        notes: [],
      }),
    ).toBe("extreme");
  });
});

describe("floodRiskToCABNZone", () => {
  it("maps risk levels to CABN flood zones", () => {
    expect(floodRiskToCABNZone(undefined)).toBe("unknown");
    expect(
      floodRiskToCABNZone({
        available: false,
        riskLevel: "Unknown",
        source: "Unavailable",
        notes: [],
      }),
    ).toBe("unknown");
    expect(
      floodRiskToCABNZone({ available: true, riskLevel: "Low", source: "FEMA", notes: [] }),
    ).toBe("none");
    expect(
      floodRiskToCABNZone({ available: true, riskLevel: "Medium", source: "FEMA", notes: [] }),
    ).toBe("moderate");
    expect(
      floodRiskToCABNZone({ available: true, riskLevel: "High", source: "FEMA", notes: [] }),
    ).toBe("floodplain");
    expect(
      floodRiskToCABNZone({
        available: true,
        riskLevel: "High",
        floodZone: "AE",
        source: "FEMA",
        notes: ["regulatory floodway constraint"],
      }),
    ).toBe("floodway");
  });
});

const excellentInput: CABNParcelScoringInput = {
  parcelId: "excellent",
  apn: "123-456",
  boundary: {
    exists: true,
    geometry: { type: "Polygon" },
    lotAreaAcres: 0.52,
    usableAreaSqft: 18000,
    shape: "regular",
    roadFrontageFt: 92,
    access: "legal",
    legalRoadAccess: true,
    dimensionsKnown: true,
  },
  physical: {
    maxFootprintSqft: 360,
    setbacksKnown: true,
    foundationFeasible: true,
    transportationFeasible: true,
    craneOrTruckAccess: true,
    minimumRoadWidthFt: 16,
  },
  topography: {
    slopePct: 3,
    elevationFt: 910,
    aspect: "south",
    drainage: "good",
    ridgelineRisk: "low",
    cutFillComplexity: "Low",
  },
  regulatory: {
    zoningCompatibility: "compatible",
    minimumSetbacksKnown: true,
    maxLotCoveragePct: 25,
    heightLimitFt: 18,
    minimumDwellingSizeSqft: 100,
    aduAllowed: true,
    overlayDistricts: [],
    fireSeverity: "low",
    floodZone: "none",
    environmentalConstraint: "none",
    historicDistrict: false,
    coastalZone: false,
    utilityEasements: "none",
  },
  existingConditions: {
    existingBuildings: false,
    drivewayExists: true,
    treeClearingLikely: false,
    poolPresent: false,
  },
  utilities: {
    utilitiesKnown: true,
    powerAvailable: true,
    waterAvailable: true,
    sewerAvailable: false,
    septicLikely: true,
    utilityPathFeasible: true,
    roadAccessConfirmed: true,
  },
  complexity: {
    permittingComplexity: "Low",
    siteWorkComplexity: "Low",
  },
};

describe("cabnCompatibilityScore", () => {
  it("scores a fully evidenced, build-friendly parcel as excellent", () => {
    const result = cabnCompatibilityScore(excellentInput);

    expect(result.canBuild).toBe(true);
    expect(result.rating).toBe("Excellent");
    expect(result.totalScore).toBeGreaterThanOrEqual(85);
    expect(result.recommendedModel?.id).toBe("cabn-200");
    expect(result.possibleModels.map((model) => model.id)).toContain("cabn-120");
    expect(result.blockers).toHaveLength(0);
    expect(result.confidence).toBe("High");
    expect(result.categoryScores.geometry.maxPoints).toBe(20);
    expect(result.categoryScores.physicalFit.maxPoints).toBe(15);
    expect(result.categoryScores.topography.maxPoints).toBe(15);
    expect(result.categoryScores.regulatory.maxPoints).toBe(20);
    expect(result.categoryScores.utilities.maxPoints).toBe(20);
    expect(result.categoryScores.complexity.maxPoints).toBe(10);
  });

  it("treats missing diligence data as unknown instead of an automatic failure", () => {
    const result = cabnCompatibilityScore({
      parcelId: "unknown-heavy",
      boundary: {
        exists: true,
        geometry: { type: "Polygon" },
        lotAreaAcres: 0.31,
        access: "legal",
        legalRoadAccess: true,
      },
      regulatory: {
        zoningCompatibility: "compatible",
      },
      utilities: {
        powerAvailable: true,
        waterAvailable: true,
        septicLikely: true,
      },
    });

    expect(result.canBuild).toBe("unknown");
    expect(result.rating).not.toBe("Not Recommended");
    expect(result.recommendedModel).not.toBeNull();
    expect(result.blockers).toHaveLength(0);
    expect(result.unknowns.length).toBeGreaterThan(8);
    expect(result.confidence).toBe("Low");
  });

  it("marks missing parcel geometry as a data blocker without pretending the parcel is physically impossible", () => {
    const result = cabnCompatibilityScore({
      ...excellentInput,
      boundary: {
        ...excellentInput.boundary,
        exists: false,
        geometry: undefined,
      },
    });

    expect(result.canBuild).toBe("unknown");
    expect(result.rating).toBe("High Risk");
    expect(result.totalScore).toBeLessThanOrEqual(56);
    expect(result.blockers).toContain(
      "Parcel geometry is missing; CABN cannot verify a build envelope.",
    );
  });

  it("returns not recommended when hard build blockers are known", () => {
    const result = cabnCompatibilityScore({
      parcelId: "blocked",
      boundary: {
        exists: true,
        geometry: { type: "Polygon" },
        lotAreaAcres: 0.02,
        usableAreaSqft: 500,
        shape: "narrow",
        roadFrontageFt: 0,
        access: "none",
        legalRoadAccess: false,
        dimensionsKnown: true,
      },
      physical: {
        maxFootprintSqft: 80,
        setbacksKnown: false,
        foundationFeasible: false,
        transportationFeasible: false,
        craneOrTruckAccess: false,
        minimumRoadWidthFt: 6,
      },
      topography: {
        slopePct: 32,
        drainage: "poor",
        ridgelineRisk: "high",
        cutFillComplexity: "High",
      },
      regulatory: {
        zoningCompatibility: "incompatible",
        minimumSetbacksKnown: false,
        maxLotCoveragePct: 2,
        minimumDwellingSizeSqft: 450,
        floodZone: "floodway",
        fireSeverity: "extreme",
        environmentalConstraint: "extreme",
        coastalZone: true,
        utilityEasements: "major",
      },
      utilities: {
        utilitiesKnown: true,
        powerAvailable: false,
        waterAvailable: false,
        sewerAvailable: false,
        septicLikely: false,
        utilityPathFeasible: false,
        roadAccessConfirmed: false,
      },
      complexity: {
        permittingComplexity: "High",
        siteWorkComplexity: "High",
      },
    });

    expect(result.canBuild).toBe(false);
    expect(result.rating).toBe("Not Recommended");
    expect(result.totalScore).toBeLessThanOrEqual(34);
    expect(result.recommendedModel).toBeNull();
    expect(result.possibleModels).toHaveLength(0);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "Lot is too small for any CABN model.",
        "No legal road access is known.",
        "Zoning is explicitly incompatible with CABN placement.",
        "Slope is above CABN acceptable threshold.",
        "No feasible sewer or septic path is known.",
      ]),
    );
    expect(result.nextSteps[0]).toContain("Resolve blocker");
  });

  it("treats very high fire severity as a major warning, not a standalone blocker", () => {
    const result = cabnCompatibilityScore({
      ...excellentInput,
      regulatory: {
        ...excellentInput.regulatory,
        fireSeverity: "extreme",
      },
    });

    expect(result.canBuild).toBe(true);
    expect(result.blockers).not.toContain(
      "Fire severity constraint makes permitting extremely unlikely.",
    );
    expect(result.warnings).toContain(
      "Very High Fire Hazard Severity Zone; defensible-space, insurance, access, water, and permitting review recommended.",
    );
    expect(result.permittingComplexity).toBe("High");
  });

  it("uses USDA soil suitability as an explainable site-work signal", () => {
    const result = cabnCompatibilityScore({
      ...excellentInput,
      existingConditions: {
        ...excellentInput.existingConditions,
        soil: {
          available: true,
          drainageClass: "Poor",
          septicSuitability: "Poor",
          foundationSuitability: "Poor",
          shrinkSwellRisk: "High",
          erosionRisk: "Medium",
          drainageRisk: "High",
          estimatedExcavationDifficulty: "High",
          confidence: "High",
          source: "USDA SSURGO",
          notes: ["Poor drainage; geotechnical review recommended."],
        },
      },
      complexity: {
        ...excellentInput.complexity,
        siteWorkComplexity: "High",
      },
    });

    expect(result.categoryScores.utilities.maxPoints).toBe(20);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "USDA soils indicate poor drainage; foundation and site-work review recommended.",
        "USDA soils flag foundation suitability concerns; geotechnical review recommended.",
        "USDA soils indicate poor septic suitability; septic feasibility review recommended.",
      ]),
    );
    expect(result.siteComplexity).toBe("High");
  });
});

describe("usgsTopoToCABNTopography", () => {
  it("maps available USGS topography to engine fields", () => {
    const mapped = usgsTopoToCABNTopography({
      available: true,
      elevationFeet: 5280,
      averageSlopePercent: 3,
      maxSlopePercent: 5,
      terrainClass: "Gentle",
      aspect: "South",
      drainageRisk: "Low",
      estimatedSiteComplexity: "Low",
      confidence: "High",
      notes: [],
    });
    expect(mapped).toMatchObject({
      slopePct: 3,
      elevationFt: 5280,
      aspect: "south",
      drainage: "good",
      cutFillComplexity: "Low",
    });
  });

  it("returns undefined when USGS data is unavailable", () => {
    expect(
      usgsTopoToCABNTopography({ available: false, confidence: "Low", notes: [] }),
    ).toBeUndefined();
  });

  it("scores steep terrain lower than flat in the topography category", () => {
    const flat = cabnCompatibilityScore({
      ...excellentInput,
      topography: { slopePct: 1, drainage: "good", aspect: "south" },
    });
    const steep = cabnCompatibilityScore({
      ...excellentInput,
      topography: { slopePct: 45, drainage: "poor" },
    });
    expect(steep.categoryScores.topography.score).toBeLessThan(
      flat.categoryScores.topography.score,
    );
  });
});
