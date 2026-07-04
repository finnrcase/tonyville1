import { describe, expect, it } from "vitest";
import { evaluateParcel } from "@/lib/providers/parcelEvaluationService";
import { defaultSearchFilters } from "@/lib/parcelSearch";
import type { Parcel } from "@/types/parcel";

// Test-only fixture (fabricated data is no longer shipped in runtime code).
const fixtureParcel: Parcel = {
  id: "fixture-eval-1",
  provider: "regrid",
  providerParcelId: "fixture-apn-1",
  title: "Fixture parcel",
  address: "1 Test Rd",
  city: "Testville",
  county: "Test",
  state: "TX",
  price: 120_000,
  acreage: 1.5,
  lat: 30.2672,
  lng: -97.7431,
  priceSource: "listing",
  utilities: { water: true, electricity: true, sewerSeptic: true },
  roadAccess: { available: true, type: "paved", label: "Paved road" },
  zoningRisk: "low",
  permitFriendliness: "friendly",
  zoningSummary: "Test zoning summary",
  terrain: "flat terrain",
  parcelUse: "Vacant land",
  nearbyAmenities: [],
  estimatedSiteWork: [],
  daysOnMarket: 10,
  highlights: [],
  constraints: [],
};

describe("parcelEvaluationService", () => {
  it("builds a unified evaluation input and CABN score from provider data", () => {
    const parcel = fixtureParcel;
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
    // Live providers do not publish utility availability; it must stay
    // unknown rather than assumed.
    expect(result.input.utilities?.powerAvailable).toBeUndefined();
    expect(result.input.utilities?.utilitiesKnown).toBe(false);
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
