import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/debug/env/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/debug/env", () => {
  it("reports only presence and exposure metadata", async () => {
    vi.stubEnv("REGRID_API_KEY", "super-secret-test-key");
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "public-test-token");

    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.env.REGRID_API_KEY).toEqual({
      configured: true,
      exposure: "server-only",
    });
    expect(body.env.NEXT_PUBLIC_MAPBOX_TOKEN).toEqual({
      configured: true,
      exposure: "public",
    });
    expect(serialized).not.toContain("super-secret-test-key");
    expect(serialized).not.toContain("public-test-token");
  });
});
