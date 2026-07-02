import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function optionCardClass(selected: boolean, extra?: string) {
  return cn(
    "block w-full rounded-[22px] bg-surface p-4 text-left transition duration-200 hover:-translate-y-0.5",
    selected
      ? "outline outline-[1.5px] outline-select bg-[color-mix(in_srgb,var(--select)_6%,var(--surface))] shadow-[0_16px_40px_rgba(59,111,224,0.10)]"
      : "border border-hairline hover:border-[color-mix(in_srgb,var(--ink)_16%,transparent)]",
    extra,
  );
}

export function OptionCard({
  selected = false,
  onClick,
  className,
  children,
}: {
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={optionCardClass(selected, className)}
    >
      {children}
    </button>
  );
}
