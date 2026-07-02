import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function Card({
  className,
  children,
  elevated,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; elevated?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[24px] bg-surface",
        elevated
          ? "shadow-[0_22px_60px_rgba(22,24,23,0.10)]"
          : "border border-hairline",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
