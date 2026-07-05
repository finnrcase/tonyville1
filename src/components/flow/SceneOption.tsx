"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * The one option style used across every staged scene: large target, calm
 * label, selected = brand green with a check. Options always stack in the
 * same position inside SceneShell's decision column.
 */
export function SceneOption({
  label,
  description,
  icon,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  description?: string;
  icon?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        "flex w-full items-center gap-3 rounded-[22px] px-5 text-left transition duration-200",
        description ? "min-h-[76px] py-3" : "min-h-[60px] py-2",
        selected
          ? "bg-brand text-white shadow-[0_18px_40px_rgba(34,64,47,0.22)]"
          : "border border-hairline bg-surface text-ink hover:-translate-y-0.5 hover:bg-white",
        disabled ? "pointer-events-none opacity-60" : "",
      ].join(" ")}
    >
      {icon ? (
        <span
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            selected ? "bg-white/14 text-white" : "bg-sunken text-brand",
          ].join(" ")}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{label}</span>
        {description ? (
          <span
            className={[
              "mt-0.5 block truncate text-sm leading-5",
              selected ? "text-white/75" : "text-ink-soft",
            ].join(" ")}
          >
            {description}
          </span>
        ) : null}
      </span>
      {selected ? <Check className="h-5 w-5 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}
