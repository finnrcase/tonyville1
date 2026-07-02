import Link from "next/link";
import { Compass, Home } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 text-ink">
      <section className="w-full max-w-md rounded-[32px] border border-hairline bg-surface p-8 text-center shadow-[0_28px_90px_rgba(22,24,23,0.16)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken text-ink-soft">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.28em] text-ink-faint">
          404
        </p>
        <h1 className="mt-3 font-display text-2xl font-medium text-ink">
          This page wandered off
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          The page you’re looking for doesn’t exist or has moved. Let’s get you
          back on track.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/" className={buttonClass("primary", "md", "gap-2")}>
            <Home className="h-4 w-4" aria-hidden="true" />
            Back home
          </Link>
        </div>
      </section>
    </main>
  );
}
