import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function PreviewArea({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {children}
    </div>
  );
}
