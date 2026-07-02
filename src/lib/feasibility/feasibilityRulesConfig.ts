export type FeasibilityStatus = "likely" | "needs_review" | "unlikely";

export type FeasibilityConfidence = "high" | "medium" | "low";

export type FeasibilityRuleResult = {
  ruleId: string;
  label: string;
  status: FeasibilityStatus;
  message: string;
  confidence?: FeasibilityConfidence;
  evidence?: unknown;
};

export type FeasibilityResult = {
  overallStatus: FeasibilityStatus;
  summary: string;
  rules: FeasibilityRuleResult[];
};

export type FeasibilityRulesConfig = {
  slope: {
    green: { maxPercent: number };
    yellow: { minPercent: number; maxPercent: number };
    red: { minPercent: number };
  };
  buildArea: {
    green: { minUsableAreaMultiplier: number };
    yellow: { minUsableAreaMultiplier: number };
    red: { maxUsableAreaMultiplier: number };
  };
  setback: {
    green: { minFeet: number };
    yellow: { minFeet: number; maxFeet: number };
    red: { maxFeet: number };
  };
  utilityDistance: {
    green: { maxFeet: number };
    yellow: { minFeet: number; maxFeet: number };
    red: { minFeet: number };
  };
  deliveryWidth: {
    green: { minFeet: number };
    yellow: { minFeet: number; maxFeet: number };
    red: { maxFeet: number };
  };
  structureClearance: {
    green: { minFeet: number };
    yellow: { minFeet: number; maxFeet: number };
    red: { maxFeet: number };
  };
  boundaryConfidence: {
    estimatedBoundaryStatus: FeasibilityStatus;
    missingBoundaryStatus: FeasibilityStatus;
  };
  jurisdiction: {
    unknownStatus: FeasibilityStatus;
    supportedStatus: FeasibilityStatus;
    unsupportedStatus: FeasibilityStatus;
  };
  placementValidity: {
    invalidStatus: FeasibilityStatus;
    validWithUnknownsStatus: FeasibilityStatus;
    validStatus: FeasibilityStatus;
  };
};

export const feasibilityRulesConfig: FeasibilityRulesConfig = {
  slope: {
    green: { maxPercent: 10 },
    yellow: { minPercent: 10, maxPercent: 20 },
    red: { minPercent: 20 },
  },
  buildArea: {
    green: { minUsableAreaMultiplier: 4 },
    yellow: { minUsableAreaMultiplier: 1.5 },
    red: { maxUsableAreaMultiplier: 1.5 },
  },
  setback: {
    green: { minFeet: 5 },
    yellow: { minFeet: 0, maxFeet: 5 },
    red: { maxFeet: 0 },
  },
  utilityDistance: {
    green: { maxFeet: 50 },
    yellow: { minFeet: 50, maxFeet: 150 },
    red: { minFeet: 150 },
  },
  deliveryWidth: {
    green: { minFeet: 10 },
    yellow: { minFeet: 8, maxFeet: 10 },
    red: { maxFeet: 8 },
  },
  structureClearance: {
    green: { minFeet: 10 },
    yellow: { minFeet: 5, maxFeet: 10 },
    red: { maxFeet: 5 },
  },
  boundaryConfidence: {
    estimatedBoundaryStatus: "needs_review",
    missingBoundaryStatus: "unlikely",
  },
  jurisdiction: {
    unknownStatus: "needs_review",
    supportedStatus: "likely",
    unsupportedStatus: "unlikely",
  },
  placementValidity: {
    invalidStatus: "unlikely",
    validWithUnknownsStatus: "needs_review",
    validStatus: "likely",
  },
};
