import { afterEach, describe, expect, it, vi } from "vitest";
import { searchRegridParcels } from "@/lib/regrid";
import { defaultSearchFilters } from "@/lib/parcelSearch";

const originalFetch = globalThis.fetch;
const center = { label: "Austin, TX", lat: 30.2672, lng: -97.7431 };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("searchRegridParcels", () => {
  it("uses the Regrid area endpoint with GeoJSON lng/lat coordinates", async () => {
    vi.stubEnv("REGRID_API_KEY", "secret-regrid-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          area: { acres: 10 },
          parcels: {
            type: "FeatureCollection",
            features: [
              {
                id: "parcel-1",
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-97.744, 30.267],
                      [-97.743, 30.267],
                      [-97.743, 30.268],
                      [-97.744, 30.267],
                    ],
                  ],
                },
                properties: {
                  headline: "Austin test parcel",
                  fields: {
                    city: "Austin",
                    state2: "TX",
                    county: "Travis",
                    parcelnumb: "123",
                    ll_gisacre: 0.25,
                  },
                },
              },
            ],
          },
        }),
    });
    globalThis.fetch = fetchMock;

    const result = await searchRegridParcels({
      center,
      filters: { ...defaultSearchFilters, radiusMiles: 2 },
    });
    const url = new URL(fetchMock.mock.calls[0][0].toString());

    expect(url.pathname).toBe("/api/v2/parcels/area");
    expect(JSON.parse(url.searchParams.get("geojson") ?? "{}")).toEqual({
      type: "Point",
      coordinates: [-97.7431, 30.2672],
    });
    expect(url.searchParams.get("token")).toBe("secret-regrid-token");
    expect(result.status).toBe("ready");
    expect(result.parcels[0].provider).toBe("regrid");
  });

  it("surfaces 403 geography or plan access failures safely", async () => {
    vi.stubEnv("REGRID_API_KEY", "secret-regrid-token");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          status: "error",
          message: "This area is not included in API trials.",
        }),
    });

    const result = await searchRegridParcels({
      center,
      filters: defaultSearchFilters,
    });
    const serialized = JSON.stringify(result);

    expect(result.status).toBe("error");
    expect(result.message).toContain("Regrid authorization failed (403)");
    expect(result.message).toContain("Mock Data Fallback active");
    expect(result.diagnostic?.statusCode).toBe(403);
    expect(serialized).not.toContain("secret-regrid-token");
  });

  it("caps Regrid area radius to the provider maximum", async () => {
    vi.stubEnv("REGRID_API_KEY", "secret-regrid-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          parcels: { type: "FeatureCollection", features: [] },
        }),
    });
    globalThis.fetch = fetchMock;

    const result = await searchRegridParcels({
      center,
      filters: { ...defaultSearchFilters, radiusMiles: 55 },
    });
    const url = new URL(fetchMock.mock.calls[0][0].toString());

    expect(url.searchParams.get("radius")).toBe("17841");
    expect(result.message).toContain("capped from 55 miles");
  });
});
