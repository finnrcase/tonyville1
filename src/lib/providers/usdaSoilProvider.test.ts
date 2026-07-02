import { afterEach, describe, expect, it, vi } from "vitest";
import { getSoilData } from "@/lib/providers/usdaSoilProvider";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getSoilData", () => {
  it("normalizes USDA SDA soil rows into suitability fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          Table: [
            ["mukey", "muname", "compname", "comppct_r", "drainagecl", "hydgrp", "taxclname"],
            [
              "469946",
              "Danville-Urban land complex, 9 to 15 percent slopes",
              "Danville",
              "80",
              "Well drained",
              "C",
              "Fine, smectitic, thermic Pachic Argixerolls",
            ],
          ],
        }),
      }),
    );

    const result = await getSoilData({ lat: 34.0259, lng: -118.7798 });

    expect(result.available).toBe(true);
    expect(result.source).toBe("USDA SSURGO");
    expect(result.drainageClass).toBe("Good");
    expect(result.septicSuitability).toBe("Fair");
    expect(result.foundationSuitability).toBe("Poor");
    expect(result.shrinkSwellRisk).toBe("High");
    expect(result.erosionRisk).toBe("High");
  });

  it("returns unavailable when USDA SDA fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const result = await getSoilData({ lat: 34.0259, lng: -118.7798 });

    expect(result).toMatchObject({
      available: false,
      source: "Unavailable",
      confidence: "Low",
    });
  });
});
