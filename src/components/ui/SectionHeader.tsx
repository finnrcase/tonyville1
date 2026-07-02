import type { ReactNode } from "react";

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      {eyebrow ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="font-display text-2xl font-medium leading-tight tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {description ? (
        <p className="text-sm leading-6 text-ink-soft">{description}</p>
      ) : null}
    </div>
  );
}
