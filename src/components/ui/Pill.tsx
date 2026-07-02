import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft shadow-[0_1px_2px_rgba(22,24,23,0.05)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
