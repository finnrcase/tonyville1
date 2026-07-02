import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

type Tone = "neutral" | "ok" | "warn" | "risk";

const toneText: Record<Tone, string> = {
  neutral: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  risk: "text-risk",
};

export function StatusRow({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-sunken px-3 py-2.5 text-sm">
      <span className="flex items-center gap-2 font-medium text-ink-soft">
        {icon}
        {label}
      </span>
      <span className={cn("font-medium", toneText[tone])}>{value}</span>
    </div>
  );
}
