import { describe, expect, it } from "vitest";
import { defaultSearchFilters, scoreAndFilterParcels } from "@/lib/parcelSearch";
import type { Parcel } from "@/types/parcel";

// Test-only fixture: a parcel that passes road-access/utility/permit filters,
// pinned to the search center so only the price filter differentiates.
const baseParcel: Parcel = {
  id: "fixture-1",
  provider: "regrid",
  title: "Fixture parcel",
  address: "1 Test Rd",
  city: "Testville",
  county: "Test",
  state: "TX",
  price: 100_000,
  acreage: 1.2,
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

describe("scoreAndFilterParcels price filter", () => {
  const center = { label: "Test", lat: baseParcel.lat, lng: baseParcel.lng };
  const at = (over: Partial<Parcel>): Parcel => ({
    ...baseParcel,
    ...over,
  });
  const filters = { ...defaultSearchFilters, maxPrice: 175_000, radiusMiles: 10 };

  it("excludes listing prices above the buyer's budget", () => {
    const inBudget = at({ id: "listing-in", price: 90_000, priceSource: "listing" });
    const overBudget = at({ id: "listing-over", price: 400_000, priceSource: "listing" });
    const ids = scoreAndFilterParcels([inBudget, overBudget], filters, center).map(
      (parcel) => parcel.id,
    );
    expect(ids).toContain("listing-in");
    expect(ids).not.toContain("listing-over");
  });

  it("keeps assessed/estimated parcels above budget (assessed value is not an asking price)", () => {
    const assessed = at({ id: "assessed-over", price: 650_000, priceSource: "assessed" });
    const estimated = at({ id: "estimated-over", price: 260_000, priceSource: "estimated" });
    const ids = scoreAndFilterParcels([assessed, estimated], filters, center).map(
      (parcel) => parcel.id,
    );
    expect(ids).toContain("assessed-over");
    expect(ids).toContain("estimated-over");
  });
});
