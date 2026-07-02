# CABN Configurator — Phase 1 Implementation Plan

> Execute inline with TDD where it applies + commit per task.

**Goal:** Replace the map-first homepage with a guided `Build your CABN plan` wizard
(path → model), routing "find land" into the existing search (model pre-applied) and "own
property" into a Phase-2 placeholder — completing the new funnel without touching Flow B's
engine or the provider stack.

**Spec:** `docs/superpowers/specs/2026-06-28-cabn-configurator-design.md`

**Notes:** Wizard URL keys are `path` + `cabn` (NOT `model`, which `TonyvilleApp` already
uses for `modelSize`). Flow B is seeded by mapping the chosen CABN model's `sizeSqft` to a
valid `TinyHomeModelSize` (480 → 200). No `TonyvilleApp` signature change.

---

## Task 1: Shared model module

**File:** `src/lib/cabnModels.ts`

```ts
import { CABN_MODELS, type CABNModel } from "@/lib/scoring/cabnCompatibilityScore";

export { CABN_MODELS };
export type { CABNModel };

export function getCabnModel(id: string): CABNModel | undefined {
  return CABN_MODELS.find((model) => model.id === id);
}

// Map a CABN model footprint onto the search filter's TinyHomeModelSize (clamp 480 -> 200).
export function toFilterModelSize(model: CABNModel): 120 | 140 | 160 | 200 {
  const sizes = [120, 140, 160, 200] as const;
  return (sizes as readonly number[]).includes(model.sizeSqft)
    ? (model.sizeSqft as 120 | 140 | 160 | 200)
    : 200;
}
```
- [ ] `npx tsc --noEmit` → PASS; commit `feat: add shared CABN models module`.

---

## Task 2: Build-plan state (TDD)

**Files:** `src/lib/buildPlanState.ts`, test `src/lib/buildPlanState.test.ts`

- [ ] **Test:**
```ts
import { describe, expect, it } from "vitest";
import {
  buildPlanToParams,
  currentStep,
  parseBuildPlan,
} from "@/lib/buildPlanState";

const reader = (obj: Record<string, string>) => ({ get: (k: string) => obj[k] ?? null });

describe("buildPlanState", () => {
  it("parses valid path and model", () => {
    expect(parseBuildPlan(reader({ path: "own", cabn: "cabn-120" }))).toEqual({
      path: "own",
      modelId: "cabn-120",
    });
  });
  it("ignores invalid path and unknown model id", () => {
    expect(parseBuildPlan(reader({ path: "nope", cabn: "ghost" }))).toEqual({});
  });
  it("serializes only set fields", () => {
    expect(buildPlanToParams({ path: "find", modelId: "cabn-200" }).toString()).toBe(
      "path=find&cabn=cabn-200",
    );
    expect(buildPlanToParams({}).toString()).toBe("");
  });
  it("derives the current step", () => {
    expect(currentStep({})).toBe(1);
    expect(currentStep({ path: "find" })).toBe(2);
    expect(currentStep({ path: "find", modelId: "cabn-160" })).toBe(3);
  });
});
```
- [ ] Run → FAIL.
- [ ] **Implement** `src/lib/buildPlanState.ts`:
```ts
import { getCabnModel } from "@/lib/cabnModels";

export type BuildPath = "own" | "find";
export type BuildPlan = { path?: BuildPath; modelId?: string };

type ParamReader = { get(name: string): string | null };

export function parseBuildPlan(params: ParamReader): BuildPlan {
  const rawPath = params.get("path");
  const rawModel = params.get("cabn");
  const plan: BuildPlan = {};
  if (rawPath === "own" || rawPath === "find") plan.path = rawPath;
  if (rawModel && getCabnModel(rawModel)) plan.modelId = rawModel;
  return plan;
}

export function buildPlanToParams(plan: BuildPlan): URLSearchParams {
  const params = new URLSearchParams();
  if (plan.path) params.set("path", plan.path);
  if (plan.modelId) params.set("cabn", plan.modelId);
  return params;
}

export function currentStep(plan: BuildPlan): 1 | 2 | 3 {
  if (!plan.path) return 1;
  if (!plan.modelId) return 2;
  return 3;
}
```
- [ ] Run → PASS; commit `feat: add build-plan URL state`.

---

## Task 3: Wizard step components

**Files:** `src/components/plan/PlanSummary.tsx`, `ModelCard.tsx`, `PathStep.tsx`, `ModelStep.tsx`

- [ ] **PlanSummary.tsx** — persistent "your CABN" chip + step-back controls:
```tsx
"use client";
import type { CABNModel } from "@/lib/cabnModels";
import type { BuildPath } from "@/lib/buildPlanState";

export function PlanSummary({
  path,
  model,
  onReset,
  onChangeModel,
}: {
  path?: BuildPath;
  model?: CABNModel;
  onReset: () => void;
  onChangeModel: () => void;
}) {
  if (!path && !model) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {path ? (
        <button
          type="button"
          onClick={onReset}
          className="rounded-full bg-[#f7f6f2] px-3 py-1 font-semibold text-[#27302b]"
        >
          {path === "own" ? "I have a property" : "Finding land"} ✕
        </button>
      ) : null}
      {model ? (
        <button
          type="button"
          onClick={onChangeModel}
          className="rounded-full bg-[#eef7f0] px-3 py-1 font-semibold text-[#203b2c]"
        >
          {model.name} · {model.widthFt}×{model.lengthFt} ft ✕
        </button>
      ) : null}
    </div>
  );
}
```
- [ ] **ModelCard.tsx**:
```tsx
"use client";
import { formatCurrency } from "@/lib/format";
import type { CABNModel } from "@/lib/cabnModels";

export function ModelCard({
  model,
  selected,
  onSelect,
}: {
  model: CABNModel;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-3 rounded-[24px] border p-5 text-left transition hover:-translate-y-0.5 ${
        selected
          ? "border-[#203b2c] bg-[#eef7f0] shadow-[0_18px_55px_rgba(22,24,23,0.14)]"
          : "border-[#edf0ec] bg-white shadow-[0_8px_24px_rgba(22,24,23,0.04)]"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold text-[#111817]">{model.name}</span>
        <span className="font-mono text-sm font-semibold text-[#203b2c]">
          {model.sizeSqft} sqft
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-[#56605a]">
        <div className="rounded-xl bg-[#f7f6f2] px-2 py-1">
          Footprint {model.widthFt}×{model.lengthFt} ft
        </div>
        <div className="rounded-xl bg-[#f7f6f2] px-2 py-1 capitalize">
          {model.foundation} foundation
        </div>
        <div className="rounded-xl bg-[#f7f6f2] px-2 py-1">
          Max slope {model.maximumSlopePct}%
        </div>
        <div className="rounded-xl bg-[#f7f6f2] px-2 py-1">
          From {formatCurrency.format(model.sizeSqft * 450)}*
        </div>
      </div>
      <span className="text-xs font-semibold text-[#2b6f83]">
        {selected ? "Selected" : "Choose this model"}
      </span>
    </button>
  );
}
```
  (Price is an explicit placeholder: `sizeSqft × $450` with a `*` footnote.)
- [ ] **PathStep.tsx**:
```tsx
"use client";
import { Home, MapPinned } from "lucide-react";
import type { BuildPath } from "@/lib/buildPlanState";

export function PathStep({ onSelect }: { onSelect: (path: BuildPath) => void }) {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onSelect("own")}
        className="flex flex-col items-start gap-3 rounded-[28px] border border-[#edf0ec] bg-white p-6 text-left shadow-[0_8px_24px_rgba(22,24,23,0.04)] transition hover:-translate-y-1"
      >
        <Home className="h-7 w-7 text-[#203b2c]" aria-hidden="true" />
        <span className="text-xl font-semibold text-[#111817]">I already have a property</span>
        <span className="text-sm text-[#56605a]">
          See whether your CABN fits on your lot, with setback and clearance checks.
        </span>
      </button>
      <button
        type="button"
        onClick={() => onSelect("find")}
        className="flex flex-col items-start gap-3 rounded-[28px] border border-[#edf0ec] bg-white p-6 text-left shadow-[0_8px_24px_rgba(22,24,23,0.04)] transition hover:-translate-y-1"
      >
        <MapPinned className="h-7 w-7 text-[#2b6f83]" aria-hidden="true" />
        <span className="text-xl font-semibold text-[#111817]">Help me find land</span>
        <span className="text-sm text-[#56605a]">
          Search and rank parcels by how well they fit your CABN.
        </span>
      </button>
    </div>
  );
}
```
- [ ] **ModelStep.tsx**:
```tsx
"use client";
import { CABN_MODELS } from "@/lib/cabnModels";
import { ModelCard } from "@/components/plan/ModelCard";

export function ModelStep({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (modelId: string) => void;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CABN_MODELS.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          selected={model.id === selectedId}
          onSelect={() => onSelect(model.id)}
        />
      ))}
    </div>
  );
}
```
- [ ] `npx tsc --noEmit && npm run lint` → PASS; commit `feat: add CABN configurator step components`.

---

## Task 4: BuildPlanWizard

**File:** `src/components/plan/BuildPlanWizard.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";
import { TonyvilleApp } from "@/components/TonyvilleApp";
import { PathStep } from "@/components/plan/PathStep";
import { ModelStep } from "@/components/plan/ModelStep";
import { PlanSummary } from "@/components/plan/PlanSummary";
import {
  buildPlanToParams,
  currentStep,
  type BuildPath,
  type BuildPlan,
} from "@/lib/buildPlanState";
import { getCabnModel, toFilterModelSize } from "@/lib/cabnModels";
import type {
  MapSearchCenter,
  MapStyleMode,
  SearchFilters as SearchFiltersType,
  SortOption,
} from "@/types/parcel";

const STORAGE_KEY = "tonyville:buildPlan";

type Props = {
  initialPlan: BuildPlan;
  initialFilters: SearchFiltersType;
  initialSort: SortOption;
  initialMapStyle: MapStyleMode;
  initialMapSearchCenter?: MapSearchCenter;
  mapboxToken: string;
};

export function BuildPlanWizard({ initialPlan, ...flowB }: Props) {
  const [plan, setPlan] = useState<BuildPlan>(initialPlan);

  // Hydrate from sessionStorage when the URL carries no plan (e.g., refresh inside Flow B).
  useEffect(() => {
    if (initialPlan.path || initialPlan.modelId) return;
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) setPlan(JSON.parse(stored) as BuildPlan);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch {
      /* ignore */
    }
    if (currentStep(plan) < 3) {
      const params = buildPlanToParams(plan).toString();
      window.history.replaceState(
        null,
        "",
        params ? `${window.location.pathname}?${params}` : window.location.pathname,
      );
    }
  }, [plan]);

  const step = currentStep(plan);
  const model = plan.modelId ? getCabnModel(plan.modelId) : undefined;

  if (step === 3 && plan.path === "find" && model) {
    return (
      <TonyvilleApp
        {...flowB}
        initialFilters={{ ...flowB.initialFilters, modelSize: toFilterModelSize(model) }}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] px-5 py-10 text-[#161817]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#6f7b73]">
            Build your CABN plan
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111817]">
            {step === 1
              ? "Where will your CABN go?"
              : step === 2
                ? "Choose your CABN model"
                : "Your placement studio is next"}
          </h1>
        </header>

        <div className="mb-6 flex justify-center">
          <PlanSummary
            path={plan.path}
            model={model}
            onReset={() => setPlan({})}
            onChangeModel={() => setPlan((p) => ({ path: p.path }))}
          />
        </div>

        {step === 1 ? (
          <PathStep onSelect={(path: BuildPath) => setPlan({ path })} />
        ) : step === 2 ? (
          <ModelStep
            selectedId={plan.modelId}
            onSelect={(modelId) => setPlan((p) => ({ ...p, modelId }))}
          />
        ) : (
          <div className="mx-auto max-w-xl rounded-[28px] border border-[#edf0ec] bg-white p-8 text-center shadow-[0_8px_24px_rgba(22,24,23,0.04)]">
            <h2 className="text-xl font-semibold text-[#111817]">
              Placement studio coming next
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#56605a]">
              You picked the {model?.name}. The draggable placement simulator for your own
              property is the next release. For now, you can explore land instead.
            </p>
            <button
              type="button"
              onClick={() => setPlan((p) => ({ ...p, path: "find" }))}
              className="mt-5 rounded-2xl bg-[#203b2c] px-5 py-3 text-sm font-semibold text-white"
            >
              Explore land for this model
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
```
- [ ] `npx tsc --noEmit && npm run lint` → PASS; commit `feat: add BuildPlanWizard funnel`.

---

## Task 5: Wire the homepage

**File:** `src/app/page.tsx` — replace the direct `TonyvilleApp` mount with the wizard,
parsing the build plan from the URL and passing the Flow B props through.

```tsx
import { BuildPlanWizard } from "@/components/plan/BuildPlanWizard";
import { logMissingEnv } from "@/lib/env";
import { defaultSearchFilters } from "@/lib/parcelSearch";
import { parseSearchState } from "@/lib/searchState";
import { parseBuildPlan } from "@/lib/buildPlanState";

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toUrlSearchParams(searchParams?: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }
    if (value !== undefined) params.set(key, value);
  });
  return params;
}

export default async function Home({ searchParams }: HomeProps) {
  logMissingEnv("home", [
    "NEXT_PUBLIC_MAPBOX_TOKEN",
    "REGRID_API_KEY",
    "ATTOM_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  const params = toUrlSearchParams(await searchParams);
  const parsed = parseSearchState(params, defaultSearchFilters);
  const plan = parseBuildPlan(params);

  return (
    <BuildPlanWizard
      initialPlan={plan}
      initialFilters={parsed.filters}
      initialSort={parsed.sort}
      initialMapStyle={parsed.mapStyle}
      initialMapSearchCenter={parsed.mapSearchCenter}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""}
    />
  );
}
```
- [ ] `npx tsc --noEmit && npm run lint` → PASS; commit `feat: route homepage through the CABN build-plan wizard`.

---

## Task 6: Verify

- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` → all pass; route list still includes `/`.
- [ ] Live smoke (prod server on a free port): `/` shows Step 1; `/?path=find&cabn=cabn-120`
  lands in Step 3 → Flow B search renders. Stop server.

## Self-Review

- Funnel complete (path → model → Flow B or Flow A placeholder) ✓; shared models ✓; Flow B
  reuse with seeded model ✓; URL/`cabn` key avoids `model` collision ✓; sessionStorage keeps
  the plan across a Flow B refresh ✓; no engine/provider/Flow-B-internal changes ✓.
- Type consistency: `BuildPlan`/`BuildPath`, `parseBuildPlan`/`buildPlanToParams`/`currentStep`,
  `getCabnModel`/`toFilterModelSize`, `CABN_MODELS` used consistently.
