"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] p-4 text-[#161817]">
      <section className="w-full max-w-md rounded-[32px] border border-white/70 bg-white p-6 text-center shadow-[0_28px_90px_rgba(22,24,23,0.16)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f7f6f2] text-[#8b3f35]">
          <TriangleAlert className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#111817]">
          Tonyville needs a refresh
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#66716a]">
          Something interrupted the search experience. No saved data is affected.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#203b2c] px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#2e523e]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#e5e9e4] bg-white px-4 text-sm font-semibold text-[#27302b] transition hover:-translate-y-0.5 hover:bg-[#f7f6f2]"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
