import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export const inputClass =
  "h-12 w-full rounded-2xl border border-hairline bg-surface px-4 text-[15px] text-ink outline-none transition placeholder:text-ink-faint focus:border-[color-mix(in_srgb,var(--select)_45%,transparent)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--select)_18%,transparent)]";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}
