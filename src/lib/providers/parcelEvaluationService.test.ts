import { describe, expect, it } from "vitest";
import { evaluateParcel } from "@/lib/providers/parcelEvaluationService";
import { mockParcels } from "@/lib/mockParcels";
import { defaultSearchFilters } from "@/lib/parcelSearch";

describe("parcelEvaluationService", () => {
  it("builds a unified evaluation input and CABN score from provider data", () => {
    const parcel = mockParcels[0];
    const result = evaluateParcel({
      parcel,
      userPreferences: defaultSearchFilters,
    });

    expect(result.input).toMatchObject({
      parcelId: parcel.id,
      sourceIds: { apn: parcel.providerParcelId },
      userPreferences: defaultSearchFilters,
    });
    expect(result.input.geometry?.lotAreaAcres).toBe(parcel.acreage);
    expect(result.input.zoning?.zoningSummary).toBe(parcel.zoningSummary);
    expect(result.input.utilities?.powerAvailable).toBe(true);
    expect(result.cabnCompatibility.totalScore).toBeGreaterThan(0);
    expect(result.providers.map((provider) => provider.provider)).toEqual(
      expect.arrayContaining([
        "regrid",
        "attom",
        "topography",
        "regulatory",
        "utility",
      ]),
    );
  });
});
