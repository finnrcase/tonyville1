import { afterEach, describe, expect, it, vi } from "vitest";
import { isSupabaseConfigured } from "@/lib/supabase/readiness";

afterEach(() => vi.unstubAllEnvs());

describe("isSupabaseConfigured", () => {
  it("is true when url and anon key are present", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("is false when either is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(isSupabaseConfigured()).toBe(false);
  });
});
