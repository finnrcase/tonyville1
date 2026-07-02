import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/debug/regrid/route";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("GET /api/debug/regrid", () => {
  it("reports missing key without exposing secrets", async () => {
    vi.stubEnv("REGRID_API_KEY", "");

    const response = await GET(
      new NextRequest("http://tonyville.test/api/debug/regrid"),
    );
    const body = await response.json();

    expect(body.env.REGRID_API_KEY).toEqual({
      configured: false,
      exposure: "server-only",
    });
    expect(body.keyExists).toBe(false);
  });

  it("returns safe endpoint diagnostics without exposing the key", async () => {
    vi.stubEnv("REGRID_API_KEY", "secret-regrid-token");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          parcels: { type: "FeatureCollection", features: [] },
          buildings: {},
          zoning: {},
        }),
    });

    const response = await GET(
      new NextRequest(
        "http://tonyville.test/api/debug/regrid?lat=30.2672&lng=-97.7431&radiusMiles=1",
      ),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.keyExists).toBe(true);
    expect(body.tests.pointLookup.statusCode).toBe(200);
    expect(body.tests.areaSearch.endpoint).toContain("/api/v2/parcels/area");
    expect(body.input.areaSearchGeoJson.type).toBe("Polygon");
    expect(body.input.areaSearchGeoJson.coordinates[0]).toHaveLength(5);
    expect(body.input.areaSearchGeoJson.coordinates[0][0]).toEqual(
      body.input.areaSearchGeoJson.coordinates[0][4],
    );
    expect(body.input.areaSearchGeoJson.coordinates[0][0][0]).toBeLessThan(
      -97.7431,
    );
    expect(body.input.areaSearchGeoJson.coordinates[0][0][1]).toBeLessThan(
      30.2672,
    );
    expect(serialized).not.toContain("secret-regrid-token");
  });
});
