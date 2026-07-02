import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lookupLaCountyParcelAtPoint,
  searchLaCountyParcels,
  shouldUseLaCountyParcelFallback,
} from "@/lib/providers/laCountyParcelProvider";
import type { SearchCenter, SearchFilters } from "@/types/parcel";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

const filters: SearchFilters = {
  location: "Malibu, CA",
  radiusMiles: 10,
  maxPrice: 150000,
  modelSize: 160,
  utilities: {
    water: false,
    electricity: false,
    sewerSeptic: false,
  },
  requiresRoadAccess: true,
  permitFriendliness: "any",
};

const laCenter: SearchCenter = {
  label: "Malibu, California, United States",
  lat: 34.03688,
  lng: -118.68561,
};

describe("laCountyParcelProvider", () => {
  it("only opts into fallback for likely LA County searches", () => {
    expect(shouldUseLaCountyParcelFallback(laCenter)).toBe(true);
    expect(
      shouldUseLaCountyParcelFallback({
        label: "Map search area",
        lat: 34.0522,
        lng: -118.2437,
      }),
    ).toBe(true);
    expect(
      shouldUseLaCountyParcelFallback({
        label: "Austin, TX",
        lat: 30.2672,
        lng: -97.7431,
      }),
    ).toBe(false);
  });

  it("normalizes LA County parcel GeoJSON into internal parcels", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [-118.2449, 34.0517],
                    [-118.2442, 34.0517],
                    [-118.2442, 34.0522],
                    [-118.2449, 34.0522],
                    [-118.2449, 34.0517],
                  ],
                ],
              },
              properties: {
                AIN: "5149001915",
                APN: "5149-001-915",
                SitusFullAddress: "100 W 1ST ST LOS ANGELES CA 90012",
                SitusCity: "LOS ANGELES CA",
                TaxRateCity: "LOS ANGELES",
                UseDescription: "Government Parcel",
                Roll_LandValue: "90000",
                "Shape.STArea()": 162597.3,
              },
            },
          ],
        }),
    });

    const result = await searchLaCountyParcels({
      center: laCenter,
      filters,
      regridMessage: "Regrid empty",
    });

    expect(result.status).toBe("ready");
    expect(result.message).toContain("Using LA County GIS parcel fallback");
    expect(result.parcels[0]).toMatchObject({
      provider: "la_county_gis",
      apn: "5149-001-915",
      ain: "5149001915",
      county: "Los Angeles",
      state: "CA",
      price: 90000,
      priceSource: "assessed",
    });
    expect(result.parcels[0]?.geometry?.type).toBe("Polygon");
    expect(result.parcels[0]?.zoningSummary).toContain("Incorporated-city");
  });

  it("supports point lookup by coordinate", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [-118.245, 34.052],
                    [-118.244, 34.052],
                    [-118.244, 34.053],
                    [-118.245, 34.053],
                    [-118.245, 34.052],
                  ],
                ],
              },
              properties: {
                AIN: "5149001915",
                APN: "5149-001-915",
                SitusFullAddress: "100 W 1ST ST LOS ANGELES CA 90012",
              },
            },
          ],
        }),
    });

    const result = await lookupLaCountyParcelAtPoint({
      lat: 34.0522,
      lng: -118.2437,
    });

    expect(result.status).toBe("ready");
    expect(result.parcels[0]?.provider).toBe("la_county_gis");
    expect(String(globalThis.fetch)).not.toContain("API_KEY");
  });
});
