# Tonyville Visual Design System — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (inline). Steps use `- [ ]`. This is a **visual-only** pass: never change handlers, props, data flow, routes, or scene structure. After each task run `npx tsc --noEmit`, `npm run lint`, and `npm test` (the logic suite must stay green — it's the guardrail that behavior didn't change).

**Goal:** Wrap every existing scene in a warm, minimal, Samara-like design system (tokens + reusable primitives) with zero functional/flow changes.

**Architecture:** Tailwind v4 `@theme` tokens + a Fraunces display font, a `src/components/ui/` primitive set, and per-scene restyling that swaps hardcoded hex / ad-hoc spacing / heavy borders for tokens + primitives while preserving all JSX logic.

**Spec:** `docs/superpowers/specs/2026-07-01-visual-design-system-design.md`

**Restyle rule of thumb (apply per scene):** page bg `bg-[#f7f6f2]`→`bg-canvas`; text `#111817`→`text-ink`, `#66716a`/`#56625c`→`text-ink-soft`, faint→`text-ink-faint`; card/panel fills→`bg-surface`; insets→`bg-sunken`; borders→`border-hairline` (and remove where spacing suffices); brand green `#203b2c`→`bg-brand`/`text-brand`; selected states→`OptionCard`/blue outline; headings→`font-display`; buttons→`<Button>`; option/selection cards→`<OptionCard>`; inputs→`<Field>/<Input>`; section titles→`<SectionHeader>`; status lines→`<StatusRow>`. Keep every `onClick`, `href`, `useState`, map/effect, and prop exactly as-is.

---

## Task 1: Design tokens + Fraunces font

**Files:** `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1:** In `src/app/layout.tsx`, add Fraunces alongside Geist:
```tsx
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
// ...
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal"],
});
```
Add its variable to the `<html>` className:
```tsx
className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
```
- [ ] **Step 2:** Replace the `@theme inline` block and `:root` in `src/app/globals.css` with the token system (keep the existing `.premium-scrollbar`, `soft-pulse`, `::selection`, `button/input` rules below it):
```css
:root {
  --canvas: #f5f3ee;
  --surface: #fcfbf8;
  --sunken: #efebe4;
  --ink: #1c1e1b;
  --ink-soft: #6b6f69;
  --ink-faint: #9a9d96;
  --hairline: rgba(28, 30, 27, 0.08);
  --brand: #22402f;
  --brand-hover: #2e5340;
  --select: #3b6fe0;
  --ok: #4b7a5b;
  --warn: #b08a3e;
  --risk: #b0574b;
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-sunken: var(--sunken);
  --color-ink: var(--ink);
  --color-ink-soft: var(--ink-soft);
  --color-ink-faint: var(--ink-faint);
  --color-hairline: var(--hairline);
  --color-brand: var(--brand);
  --color-brand-hover: var(--brand-hover);
  --color-select: var(--select);
  --color-ok: var(--ok);
  --color-warn: var(--warn);
  --color-risk: var(--risk);
  --color-background: var(--canvas);
  --color-foreground: var(--ink);
  --font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-fraunces), "Fraunces", ui-serif, Georgia, serif;
  --font-mono: "Geist Mono", "Geist Mono Fallback", ui-monospace, monospace;
  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --radius-xl: 32px;
}

body {
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

html { background: var(--canvas); }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
```
- [ ] **Step 3:** `npx tsc --noEmit && npm run build` → PASS (build proves fonts/tokens resolve). Commit:
```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(design): add warm-neutral tokens and Fraunces display font"
```

---

## Task 2: Primitive components (`src/components/ui/`)

Create each file. These are presentational only.

- [ ] **Step 1: `src/components/ui/cn.ts`**
```ts
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

- [ ] **Step 2: `src/components/ui/Button.tsx`**
```tsx
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

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
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
```
(`buttonClass` lets existing `<Link>` CTAs adopt the same look without changing them to `<button>`: `<Link className={buttonClass("primary","lg")}>`.)

- [ ] **Step 3: `src/components/ui/Card.tsx`**
```tsx
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
```

- [ ] **Step 4: `src/components/ui/OptionCard.tsx`**
```tsx
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
    <button type="button" onClick={onClick} aria-pressed={selected} className={optionCardClass(selected, className)}>
      {children}
    </button>
  );
}
```
(`optionCardClass` lets `<Link>`-based option cards, e.g. Dream use-case, keep being links.)

- [ ] **Step 5: `src/components/ui/Field.tsx`**
```tsx
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
```

- [ ] **Step 6: `src/components/ui/SectionHeader.tsx`**
```tsx
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
```

- [ ] **Step 7: `src/components/ui/StatusRow.tsx`**
```tsx
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
```

- [ ] **Step 8: `src/components/ui/Pill.tsx` + `Divider.tsx` + `ProgressIndicator.tsx`**
```tsx
// Pill.tsx
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft shadow-[0_1px_2px_rgba(22,24,23,0.05)]", className)}>
      {children}
    </span>
  );
}
```
```tsx
// Divider.tsx
export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`my-6 border-0 border-t border-hairline ${className}`} />;
}
```
```tsx
// ProgressIndicator.tsx
import { cn } from "@/components/ui/cn";
export function ProgressIndicator({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={cn("h-1.5 rounded-full transition-all", i < current ? "w-6 bg-brand" : "w-2 bg-hairline")} />
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Layout shells `src/components/ui/SceneShell.tsx`, `PreviewArea.tsx`, `ConfigurationPanel.tsx`, `AppHeader.tsx`**
```tsx
// AppHeader.tsx
import Link from "next/link";
import { Home } from "lucide-react";
import type { ReactNode } from "react";
export function AppHeader({ subtitle, action }: { subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between px-6 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-white">
          <Home className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="leading-tight">
          <span className="block font-display text-base font-medium text-ink">Tonyville</span>
          {subtitle ? <span className="block text-xs text-ink-faint">{subtitle}</span> : null}
        </span>
      </Link>
      {action}
    </header>
  );
}
```
```tsx
// SceneShell.tsx — split-screen frame (preview hero + config panel)
import type { ReactNode } from "react";
export function SceneShell({ preview, panel }: { preview: ReactNode; panel: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_460px]">
      <section className="relative order-2 min-h-[48vh] lg:order-1 lg:min-h-screen">{preview}</section>
      <aside className="order-1 flex min-h-screen flex-col border-hairline lg:order-2 lg:border-l">{panel}</aside>
    </div>
  );
}
```
```tsx
// PreviewArea.tsx
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
export function PreviewArea({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("relative h-full w-full overflow-hidden", className)}>{children}</div>;
}
```
```tsx
// ConfigurationPanel.tsx
import type { ReactNode } from "react";
export function ConfigurationPanel({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="premium-scrollbar flex-1 overflow-y-auto px-6 py-7 sm:px-8">
        <div className="mx-auto flex max-w-md flex-col gap-7">{children}</div>
      </div>
      {footer ? <div className="border-t border-hairline bg-surface/80 px-6 py-4 sm:px-8">{footer}</div> : null}
    </>
  );
}
```

- [ ] **Step 10:** `npx tsc --noEmit && npm run lint` → PASS. Commit:
```bash
git add src/components/ui
git commit -m "feat(design): add reusable UI primitives"
```

---

## Task 3: Restyle Dream scene (`/`)

**File:** `src/components/BuildCabnPlanStart.tsx`

- [ ] **Step 1:** Apply the restyle rule of thumb. Concretely: page wrapper `bg-canvas`; wrap the top bar in `<AppHeader subtitle="Phase 1 Dream · Phase 2 Make It Yours" action={<Link className={buttonClass("secondary")} href={landSearchHref}>Need land first?</Link>} />`; replace the H1 with `font-display` (already large — set `font-display font-medium tracking-[-0.02em]`); use `text-ink-soft` for the subhead; convert the use-case option `<Link>`s to use `optionCardClass(active)` (keep them as links + hrefs); recommendation/style/property cards → `Card`/`OptionCard`; CTAs → `buttonClass(...)`; eyebrow chip → `<Pill>`; replace hardcoded greens/greys with tokens. Keep every `href`, `scroll={false}`, `aria-current`, and metadata logic intact.
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → PASS. Commit `style(dream): adopt design system`.

---

## Task 4: Restyle Placement scene (`/property-fit`)

**File:** `src/components/PropertyFitApp.tsx`

- [ ] **Step 1:** Wrap in `SceneShell` (map = preview hero via `PreviewArea`; left aside = `ConfigurationPanel`) **without** changing the map refs/effects or handlers. Apply tokens; address input → `Input`; model/utility/structure toggles → `OptionCard`/`buttonClass`; YardFit result → `Card` + `StatusRow`s (keep `fitScoreTone` mapping but map to `ok/warn/risk` tokens); "Rotate" slider unchanged (restyle label); "Ask Tony" mailto → `buttonClass("primary","lg")`; blockers/warnings/unknowns/next-steps sections → `SectionHeader` + lists; source/diagnostic notes keep. Do not touch `mapRef`, `draggingRef`, `useEffect` map wiring, geocode/fetch, or `placementResult`.
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → PASS. Commit `style(placement): adopt design system`.

---

## Task 5: Restyle Find Land (`/find-land`)

**Files:** `src/components/TonyvilleApp.tsx`, `SearchFilters.tsx`, `ParcelList.tsx`, `ParcelDetailPanel.tsx`, `ParcelIntelligence.tsx`, `MapView.tsx` (marker/popup colors only)

- [ ] **Step 1:** Restyle chrome to tokens/primitives while keeping the map-hero + panels layout and ALL logic (search, filters, sort, save, enrichment, detail). Filters inputs → `Input`/`Field`; filter toggles → `OptionCard`; parcel cards → `Card`; detail panel sections → `SectionHeader`/`StatusRow`; header → `AppHeader`. `MapView`: update only marker/selection colors to `--brand`/`--select`. Do not change props, handlers, effects, or the parcel fetch.
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → PASS. Commit `style(find-land): adopt design system`.

---

## Task 6: Restyle Edit CABN, Review, Place Room

**Files:** `src/components/EditCabnApp.tsx`, `ReviewCabnPlanApp.tsx`, `PlaceRoomApp.tsx`, `CabnTopDownPreview.tsx`

- [ ] **Step 1:** Apply `SceneShell`/`PreviewArea`/`ConfigurationPanel` + tokens + primitives to each, preserving all customization state, preview rendering, and reservation/summary logic. `CabnTopDownPreview` colors → tokens (`--brand`, `--select`). Commit `style(edit-review-placeroom): adopt design system` after `tsc`+`lint` pass.

---

## Task 7: Restyle admin, auth, modal

**Files:** `src/app/admin/leads/page.tsx`, `src/app/auth/sign-in/page.tsx`, `src/components/ContactTonyModal.tsx`, `src/components/AuthMenu.tsx`, `SavedSearchesMenu.tsx`

- [ ] **Step 1:** Admin table → quiet `Card` + hairline rows; auth → centered `Card` with `Field`/`Input`/`Button`; modal → `Card` surface + `Button`s; menus → `buttonClass`. Keep all forms, Supabase calls, and handlers. Commit `style(admin-auth-modal): adopt design system` after `tsc`+`lint`.

---

## Task 8: Full verification

- [ ] `npm test` → all logic tests still pass (unchanged behavior). `npm run lint` → clean. `npx tsc --noEmit` → clean. `npm run build` → succeeds; all routes present.
- [ ] Live smoke (prod server, spare port): each scene renders; verify a key interaction per scene still works — Dream option select (URL updates), Placement map drag + address search, Find-land search returns lots, Edit customization updates preview, Review renders, Contact modal submits. Stop server.
- [ ] Commit any remaining changes.

## Self-Review

- Spec coverage: tokens (T1) ✓; Fraunces (T1) ✓; primitives incl. all named components (T2) ✓; split-screen shells (T2/T4/T6) ✓; green brand + blue selection (Button/OptionCard tokens) ✓; all scenes (T3–T7) ✓; motion + reduced-motion (T1/Button/OptionCard) ✓; no functional change (verify each task via test suite T8) ✓.
- No placeholders: primitive code is complete; scene tasks are restyle checklists over large existing files (full rewrites intentionally avoided to preserve untouched logic — the "rule of thumb" + primitives define exactly what changes).
- Type consistency: `cn`, `buttonClass`, `optionCardClass`, `inputClass`, and component names are used consistently across tasks.
