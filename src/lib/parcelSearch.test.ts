import { describe, expect, it } from "vitest";
import { mockParcels } from "@/lib/mockParcels";
import { defaultSearchFilters, scoreAndFilterParcels } from "@/lib/parcelSearch";
import type { Parcel } from "@/types/parcel";

describe("scoreAndFilterParcels price filter", () => {
  const center = { label: "Test", lat: mockParcels[0].lat, lng: mockParcels[0].lng };
  // Base on a real mock parcel (which passes road-access/utility/permit filters) and
  // keep it at the search center so only the price filter differentiates.
  const at = (over: Partial<Parcel>): Parcel => ({
    ...mockParcels[0],
    lat: mockParcels[0].lat,
    lng: mockParcels[0].lng,
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
