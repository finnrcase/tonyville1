import { afterEach, describe, expect, it, vi } from "vitest";
import { getFireRisk } from "@/lib/providers/calFireProvider";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("calFireProvider", () => {
  it("does not call CAL FIRE for parcels outside California", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const result = await getFireRisk({
      lat: 32.8,
      lng: -96.8,
      state: "TX",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      available: false,
      riskLevel: "Unknown",
      source: "Unavailable",
      notes: ["Outside CAL FIRE coverage"],
    });
  });

  it("normalizes very high CAL FIRE SRA features", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              SRA: "SRA",
              HAZ_CLASS: "Very High",
              HAZ_CODE: 3,
            },
          },
        ],
      }),
    });
    globalThis.fetch = fetchMock;

    const result = await getFireRisk({
      lat: 38.58,
      lng: -120.5,
      state: "CA",
    });

    expect(result).toMatchObject({
      available: true,
      fireZone: "Very High",
      stateResponsibilityArea: true,
      localResponsibilityArea: false,
      riskLevel: "Extreme",
      confidence: "High",
      source: "CAL FIRE",
    });
    expect(result.notes.join(" ")).toContain(
      "Very High Fire Hazard Severity Zone",
    );
  });

  it("returns an unavailable result when CAL FIRE cannot be reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await getFireRisk({
      lat: 38.58,
      lng: -120.5,
      state: "California",
    });

    expect(result).toMatchObject({
      available: false,
      fireZone: "Unknown",
      riskLevel: "Unknown",
      confidence: "Low",
      source: "Unavailable",
    });
    expect(result.notes[0]).toContain("CAL FIRE fire hazard data request failed");
  });
});
