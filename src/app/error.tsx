"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";

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
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 text-ink">
      <section className="w-full max-w-md rounded-[32px] border border-hairline bg-surface p-8 text-center shadow-[0_28px_90px_rgba(22,24,23,0.16)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken text-risk">
          <TriangleAlert className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-medium text-ink">
          CABN needs a refresh
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Something interrupted the search experience. No saved data is affected.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className={buttonClass("primary", "md")}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link href="/" className={buttonClass("secondary", "md")}>
            <Home className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
