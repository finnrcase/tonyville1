"use client";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold text-[#111817]">Sign in to Tonyville</h1>
      {sent ? (
        <p className="text-sm text-[#56605a]">Check your email for a magic link.</p>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-2xl border border-[#e5e9e4] px-4 py-3 text-sm"
          />
          <button
            type="submit"
            className="rounded-2xl bg-[#203b2c] px-4 py-3 text-sm font-semibold text-white"
          >
            Send magic link
          </button>
          {error ? <p className="text-sm text-[#8b3f35]">{error}</p> : null}
        </form>
      )}
    </main>
  );
}
