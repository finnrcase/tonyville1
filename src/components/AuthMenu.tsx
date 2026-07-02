"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/readiness";

export function AuthMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setEmail(session?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  if (!configured) return null;

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setEmail(null);
  }

  if (email) {
    return (
      <button
        type="button"
        onClick={signOut}
        title={email}
        className="inline-flex h-12 items-center rounded-2xl border border-white/70 bg-white/90 px-4 text-sm font-semibold text-[#27302b] shadow-[0_18px_55px_rgba(22,24,23,0.14)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white"
      >
        Sign out
      </button>
    );
  }

  return (
    <a
      href="/auth/sign-in"
      className="inline-flex h-12 items-center rounded-2xl bg-[#203b2c] px-4 text-sm font-semibold text-white shadow-[0_18px_55px_rgba(22,24,23,0.14)] transition hover:-translate-y-0.5 hover:bg-[#2e523e]"
    >
      Sign in
    </a>
  );
}
