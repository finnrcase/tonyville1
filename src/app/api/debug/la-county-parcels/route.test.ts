import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/debug/la-county-parcels/route";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("GET /api/debug/la-county-parcels", () => {
  it("reports safe LA County GIS diagnostics", async () => {
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

    const response = await GET(
      new NextRequest("http://tonyville.test/api/debug/la-county-parcels"),
    );
    const body = await response.json();

    expect(body.endpointReachable).toBe(true);
    expect(body.statusCode).toBe(200);
    expect(body.featureCount).toBe(1);
    expect(body.geometryAvailable).toBe(true);
    expect(body.sampleFields).toContain("AIN");
    expect(JSON.stringify(body)).not.toContain("REGRID_API_KEY");
  });
});
