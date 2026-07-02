import { afterEach, describe, expect, it, vi } from "vitest";
import { getFloodRisk } from "@/lib/providers/femaProvider";

function mockFetch(json: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => json }),
  );
}
function feature(attrs: Record<string, string>) {
  return { features: [{ attributes: attrs }] };
}

afterEach(() => vi.unstubAllGlobals());

const pt = { lat: 29.95, lng: -90.07 };

describe("getFloodRisk", () => {
  it("maps a floodway to High / floodway zone string", async () => {
    mockFetch(feature({ FLD_ZONE: "AE", ZONE_SUBTY: "FLOODWAY", SFHA_TF: "T" }));
    const r = await getFloodRisk(pt);
    expect(r).toMatchObject({ available: true, riskLevel: "High", source: "FEMA", floodZone: "AE" });
    expect(r.notes.join(" ").toLowerCase()).toContain("floodway");
  });
  it("maps an SFHA AE zone to High", async () => {
    mockFetch(feature({ FLD_ZONE: "AE", ZONE_SUBTY: "", SFHA_TF: "T" }));
    expect((await getFloodRisk(pt)).riskLevel).toBe("High");
  });
  it("maps shaded-X 0.2% to Medium", async () => {
    mockFetch(feature({ FLD_ZONE: "X", ZONE_SUBTY: "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", SFHA_TF: "F" }));
    expect((await getFloodRisk(pt)).riskLevel).toBe("Medium");
  });
  it("maps minimal X to Low", async () => {
    mockFetch(feature({ FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD", SFHA_TF: "F" }));
    expect((await getFloodRisk(pt)).riskLevel).toBe("Low");
  });
  it("maps zone D to Unknown but available", async () => {
    mockFetch(feature({ FLD_ZONE: "D", ZONE_SUBTY: "", SFHA_TF: "F" }));
    const r = await getFloodRisk(pt);
    expect(r).toMatchObject({ available: true, riskLevel: "Unknown" });
  });
  it("returns available:true Unknown when no polygon is found", async () => {
    mockFetch({ features: [] });
    const r = await getFloodRisk(pt);
    expect(r).toMatchObject({ available: true, riskLevel: "Unknown", source: "FEMA" });
  });
  it("returns Unavailable on a non-ok response without throwing", async () => {
    mockFetch({}, false);
    const r = await getFloodRisk(pt);
    expect(r).toMatchObject({ available: false, riskLevel: "Unknown", source: "Unavailable" });
  });
  it("returns Unavailable on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect((await getFloodRisk(pt)).source).toBe("Unavailable");
  });
});
