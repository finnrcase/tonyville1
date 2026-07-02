import { describe, expect, it, vi } from "vitest";

const { enrichParcel } = vi.hoisted(() => ({ enrichParcel: vi.fn() }));
vi.mock("@/lib/parcelService", () => ({
  parcelService: { enrichParcel },
}));

import { POST } from "@/app/api/parcels/enrich/route";

const validBody = {
  id: "regrid-1",
  address: "1 A St",
  city: "Bastrop",
  state: "TX",
  county: "Bastrop",
  lat: 30.1,
  lng: -97.3,
};

function postRequest(body: unknown, raw = false) {
  return new Request("http://localhost/api/parcels/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe("POST /api/parcels/enrich", () => {
  it("returns 400 for invalid JSON", async () => {
    const response = await POST(postRequest("not json{", true) as never);
    expect(response.status).toBe(400);
  });

  it("returns 422 for a body missing required fields", async () => {
    const response = await POST(postRequest({ id: "x" }) as never);
    expect(response.status).toBe(422);
  });

  it("returns 200 with enrichment for a valid body", async () => {
    enrichParcel.mockResolvedValueOnce({ parcelId: "regrid-1", providers: [] });
    const response = await POST(postRequest(validBody) as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ parcelId: "regrid-1", providers: [] });
    expect(enrichParcel).toHaveBeenCalledWith(expect.objectContaining({ id: "regrid-1" }));
  });
});
