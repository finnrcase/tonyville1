import Link from "next/link";
import { Home } from "lucide-react";
import type { ReactNode } from "react";

export function AppHeader({
  subtitle,
  action,
}: {
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between px-6 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-white">
          <Home className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="leading-tight">
          <span className="block font-display text-base font-medium text-ink">
            Tonyville
          </span>
          {subtitle ? (
            <span className="block text-xs text-ink-faint">{subtitle}</span>
          ) : null}
        </span>
      </Link>
      {action}
    </header>
  );
}
