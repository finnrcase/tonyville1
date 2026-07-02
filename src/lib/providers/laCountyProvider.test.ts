import { afterEach, describe, expect, it, vi } from "vitest";
import { getLaCountyParcelData } from "@/lib/providers/laCountyProvider";

afterEach(() => {
  vi.unstubAllGlobals();
});

const lookup = {
  id: "la-1",
  address: "100 W 1st St",
  city: "Los Angeles",
  state: "CA",
  county: "Los Angeles",
  lat: 34.0522,
  lng: -118.2437,
};

describe("getLaCountyParcelData", () => {
  it("skips parcels outside LA County coverage", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLaCountyParcelData({
      ...lookup,
      state: "TX",
      county: "Travis",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      available: false,
      source: "Unavailable",
      notes: ["Outside LA County GIS parcel coverage"],
    });
  });

  it("normalizes an LA County parcel feature", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            {
              attributes: {
                AIN: "5149001915",
                APN: "5149-001-915",
                SitusFullAddress: "100 W 1ST ST LOS ANGELES CA 90012",
                SitusCity: "LOS ANGELES CA",
                UseType: "Government",
                UseDescription: "Government Parcel",
                Roll_LandValue: "100000",
                Roll_ImpValue: "50000",
              },
            },
          ],
        }),
      }),
    );

    const result = await getLaCountyParcelData(lookup);

    expect(result).toMatchObject({
      available: true,
      source: "LA County GIS",
      apn: "5149-001-915",
      useDescription: "Government Parcel",
      landValue: 100000,
      improvementValue: 50000,
    });
  });
});
