import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--select)_25%,transparent)] disabled:opacity-55 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover hover:-translate-y-0.5",
  secondary:
    "bg-surface text-ink border border-hairline hover:-translate-y-0.5 hover:bg-white",
  ghost: "text-ink-soft hover:text-ink hover:bg-sunken",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-6 text-base",
};

export function buttonClass(
  variant: Variant = "primary",
  size: Size = "md",
  extra?: string,
) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {children}
    </button>
  );
}
