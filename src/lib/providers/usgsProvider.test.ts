import { afterEach, describe, expect, it, vi } from "vitest";
import { getTopography } from "@/lib/providers/usgsProvider";

// Return a sequence of elevations for successive fetch calls (center first).
function mockElevations(values: Array<number | null>) {
  const fn = vi.fn();
  values.forEach((v) =>
    fn.mockResolvedValueOnce(
      v === null
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ value: v }) },
    ),
  );
  // Any extra calls resolve as failures.
  fn.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

const pt = { lat: 39.78, lng: -105.03 };

describe("getTopography", () => {
  it("classifies flat terrain when all samples are level", async () => {
    mockElevations(Array(9).fill(5280));
    const r = await getTopography(pt);
    expect(r.available).toBe(true);
    expect(r.elevationFeet).toBe(5280);
    expect(r.terrainClass).toBe("Flat");
    expect(r.averageSlopePercent).toBeLessThan(2);
    expect(r.estimatedSiteComplexity).toBe("Low");
  });

  it("classifies steep terrain and reports max slope", async () => {
    mockElevations([
      5280,
      5280 + 60,
      5280 - 60,
      5280 + 40,
      5280 - 40,
      5280 + 50,
      5280 - 50,
      5280 + 30,
      5280 - 30,
    ]);
    const r = await getTopography(pt);
    expect(["Moderate", "Steep", "Extreme"]).toContain(r.terrainClass);
    expect(r.maxSlopePercent ?? 0).toBeGreaterThan(0);
    expect(r.maxSlopePercent ?? 0).toBeGreaterThanOrEqual(r.averageSlopePercent ?? 0);
  });

  it("returns available:false confidence Low when the centroid sample fails", async () => {
    // All attempts (incl. the one retry) fail via the default failure mock.
    mockElevations([null]);
    const r = await getTopography(pt);
    expect(r).toMatchObject({ available: false, confidence: "Low" });
  });

  it("returns available:false when fewer than 2 samples succeed", async () => {
    // Only the centroid succeeds; every neighbor (and its retry) fails.
    mockElevations([5280]);
    expect((await getTopography(pt)).available).toBe(false);
  });
});
