# Tonyville Visual Design System ("Samara Wrap") — Design

- **Date:** 2026-07-01
- **Status:** Approved (design); pending spec review
- **Branch:** `visual-design-system`

## Goal

Make the entire app feel like the Samara backyard configurator / Apple / a high-end
architecture studio — calm, elegant, minimal, intentional — **without changing any
functionality, scene flow, navigation, interaction, or feature.** This is a token +
primitive layer wrapped around the existing product. Every scene keeps its split-screen
experience (hero preview + configuration panel + continue).

## Hard constraints (non-negotiable)

- No removed/replaced functionality, scenes, interactions, or navigation.
- No flow changes; every route and handler behaves identically.
- Only visual: tokens, spacing, typography, layout consistency, component polish.
- The Vitest suite (logic) and `tsc`/`lint`/`build` must stay green throughout — a visual
  change must never flip a test.

## Key decisions (resolved during brainstorming)

1. **Typography:** add **Fraunces** (elegant modern serif, `next/font/google`, mirroring the
   existing Geist setup) as `--font-display` for headings/section titles; **Geist** for body
   and labels; **Geist Mono** for numbers/scores.
2. **Accent:** keep **deep green** for primary CTAs and brand marks; use a **thin
   Samara-style blue outline** strictly for selected option cards/states.
3. **Scope:** build the system and restyle **all scenes** in this pass.

## Design tokens (`src/app/globals.css` + Tailwind `@theme inline`)

Exposed as CSS variables and mapped to Tailwind color names so components use semantic
classes (`bg-surface`, `text-ink`, `border-hairline`, …) instead of hardcoded hex.

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#F5F3EE` | page background (warm ivory) |
| `--surface` | `#FCFBF8` | cards / panels |
| `--surface-sunken` | `#EFEBE4` | insets, inputs, quiet fills |
| `--ink` | `#1C1E1B` | primary text (charcoal) |
| `--ink-soft` | `#6B6F69` | body text |
| `--ink-faint` | `#9A9D96` | helper/secondary text |
| `--hairline` | `rgba(28,30,27,0.08)` | thin borders/dividers (used sparingly) |
| `--brand` / `--brand-hover` | `#22402F` / `#2E5340` | primary CTA, logo |
| `--select` | `#3B6FE0` | selected state: 1.5px outline + ~6% tint fill |
| `--ok` / `--warn` / `--risk` | `#4B7A5B` / `#B08A3E` / `#B0574B` | muted status |
| radii | 12 / 18 / 24 / 32 px | `--r-sm/md/lg/xl` |
| shadow-sm/md/lg | soft, low-contrast (e.g. `0 18px 45px rgba(22,24,23,.08)`) | elevation |
| spacing | generous scale; hierarchy via whitespace, not boxes | layout |
| motion | standard ease + 150–500ms; respect `prefers-reduced-motion` | transitions |

Type scale (fluid): display 44–72 (Fraunces), h2 28–36 (Fraunces), h3 18–20, body 14–15,
small 12–13; generous line-heights; tight display tracking.

## Reusable primitives (`src/components/ui/`)

Each is a thin presentational wrapper; scenes pass their existing content/handlers through.

- **`Button`** — variants `primary` (green), `secondary` (neutral surface), `ghost`; sizes
  `md`/`lg`; large targets, rounded, quiet hover (subtle lift/scale). Renders `<button>` or,
  via `asChild`/`as`, wraps `next/link` where the app currently uses `<Link>` buttons.
- **`Card`** — surface, soft radius, optional hairline, optional elevation.
- **`OptionCard`** — selectable card: hover lift; when `selected`, thin blue outline + faint
  blue tint (no heavy fill). Used by Dream use-case/style, model pickers, filter toggles.
- **`Field` / `Input`** — label + control, generous padding, understated border, focus ring.
- **`SectionHeader`** — optional eyebrow pill, serif title, soft description.
- **`StatusRow`** — label + value + `tone` (`ok`/`warn`/`risk`/`neutral`) with a thin icon;
  used by YardFit/flood/fire/topography/LandFit panels.
- **`Pill`** — small eyebrow/label chips.
- **`Divider`** — hairline separator with vertical rhythm.
- **`ProgressIndicator`** — scene/phase step dots or bar.
- **Layout shells:** `AppHeader` (logo + secondary action), `SceneShell` (split-screen
  frame), `PreviewArea` (hero preview wrapper with generous margins), `ConfigurationPanel`
  (right column: long scroll, soft dividers, comfortable spacing, `premium-scrollbar`).

Icons: thin `lucide-react` (already used), no emoji, no saturated iconography.

## Scenes to restyle (structure + logic unchanged)

| Route | Component | Notes |
| --- | --- | --- |
| `/` | `BuildCabnPlanStart` (Dream) | hero preview + use-case/style OptionCards + CTAs |
| `/property-fit` | `PropertyFitApp` (Placement) | Mapbox hero + config panel (address, model, rotation, structures, utility, YardFit, next steps, Ask Tony) |
| `/place-room` | `PlaceRoomApp` | placement/preview + panel |
| `/edit-cabn` | `EditCabnApp` | CABN customization + `CabnTopDownPreview` hero |
| `/review-cabn-plan` | `ReviewCabnPlanApp` (Reservation) | summary + reservation |
| `/find-land` | `TonyvilleApp` + `MapView`/`ParcelList`/`SearchFilters`/`ParcelDetailPanel`/`ParcelIntelligence` | map hero + filters/list/detail restyled to the same language (still not a dashboard) |
| `/admin/leads` | admin table | quiet table styling |
| `/auth/sign-in` | auth | centered card in the same language |
| — | `ContactTonyModal` | modal restyle |

## Motion

Subtle only: fade/slide-in for panels and option selection, soft hover lifts, gentle
scroll. Centralized in tokens/utilities; `prefers-reduced-motion` disables transforms.

## Non-goals

- No new libraries beyond the Fraunces font (via `next/font/google`).
- No map/provider/scoring/data changes; no route or param changes.
- No copy rewrites beyond incidental label consistency.
- Not converting any scene into a dashboard.

## Modified-Next.js note

Fonts use `next/font/google` (the existing `Geist`/`Geist_Mono` pattern in `layout.tsx`
already confirms this works). Before adding Fraunces, confirm the font + metadata
conventions in `node_modules/next/dist/docs/` per AGENTS.md.

## Testing / verification

- After each scene: `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- `npm test` (the full logic suite) stays green — the guardrail proving no behavior changed.
- Live smoke of each restyled scene (prod server on a spare port): renders, key
  interactions still work (map drag, forms, geocode, selection, save/lead, navigation).

## Implementation phasing (one pass)

1. Tokens + Fraunces font + Tailwind theme (`globals.css`, `layout.tsx`).
2. `ui/` primitives (Button, Card, OptionCard, Field/Input, SectionHeader, StatusRow, Pill,
   Divider, ProgressIndicator, AppHeader, SceneShell, PreviewArea, ConfigurationPanel).
3. Shared chrome (AppHeader/SceneShell) adopted across scenes.
4. Restyle scenes one-by-one, verifying each: Dream → Placement → Find Land → Edit CABN →
   Review → Place Room → admin/auth/modals.
5. Full verification pass.

## Open items

- Screenshots did not attach; palette/spacing are designed to the written brief + Samara and
  can be recalibrated when screenshots are provided.
- Exact Fraunces weights/optical sizes finalized during implementation.
