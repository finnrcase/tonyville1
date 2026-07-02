export type FinancingScenario = {
  landPrice: number;
  estimatedSiteWork: number;
  tinyHomePrice: number;
};

export function estimateFinancingScenario(scenario: FinancingScenario) {
  const total =
    scenario.landPrice + scenario.estimatedSiteWork + scenario.tinyHomePrice;

  return {
    total,
    estimatedMonthlyAtSevenPercent: Math.round((total * 0.07) / 12),
  };
}
