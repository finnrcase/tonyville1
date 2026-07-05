"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import { CabnInteriorPreview } from "@/components/CabnInteriorPreview";
import { SceneShell } from "@/components/flow/SceneShell";
import { flowStepNumber } from "@/lib/flowSteps";
import { getCabnModel } from "@/lib/cabnModels";
import {
  evaluateCABNFeasibility,
  feasibilityStatusLabel,
  type FeasibilityStatus,
} from "@/lib/feasibility/cabnFeasibilityEngine";
import { formatAcres } from "@/lib/format";
import {
  createFallbackRoomPlacement,
  normalizeCABNCustomization,
  readSelectedRoomPlan,
  roomPlacementToCABNPlacement,
  type CABNCustomization,
  type RoomPlacement,
  type SelectedRoomPlan,
} from "@/lib/placeRoom";
import { yardFitScore } from "@/lib/scoring/yardFitScore";

function feasibilityDisplay(status: FeasibilityStatus) {
  if (status === "likely") return "🟢 Likely";
  if (status === "unlikely") return "🔴 Unlikely";
  return "🟡 Needs Review";
}

function feasibilityTone(status: FeasibilityStatus) {
  if (status === "likely") return "border-[#bcdac6] bg-[#eef7f0] text-[#203b2c]";
  if (status === "unlikely") return "border-[#efc5bc] bg-[#fff0ed] text-[#8b3f35]";
  return "border-[#ead7a2] bg-[#fff6df] text-[#715520]";
}

function wallLabel(value?: string) {
  if (!value) return "Not selected";
  return `${value[0]?.toUpperCase()}${value.slice(1)} wall`;
}

function recoveryPanel() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] p-5 text-[#111817]">
      <div className="max-w-xl rounded-[32px] border border-white/80 bg-white p-6 text-center shadow-[0_28px_90px_rgba(22,24,23,0.14)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#203b2c] text-white">
          <Home className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold">Select a lot first</h1>
        <p className="mt-3 text-sm leading-6 text-[#66716a]">
          Choose a land parcel or search an owned property, then place and edit
          your CABN before reviewing the plan.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/find-land"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#203b2c] px-4 text-sm font-semibold text-white"
          >
            Find land
          </Link>
          <Link
            href="/property-fit"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#eef3ef] px-4 text-sm font-semibold text-[#203b2c]"
          >
            Use my property
          </Link>
        </div>
      </div>
    </main>
  );
}

export function ReviewCabnPlanApp() {
  const [plan, setPlan] = useState<SelectedRoomPlan | null>(null);
  const selectedModel = useMemo(
    () => getCabnModel(plan?.modelId ?? "cabn-160"),
    [plan?.modelId],
  );
  const placement: RoomPlacement | null = useMemo(() => {
    if (!plan) return null;
    return plan.placement ?? createFallbackRoomPlacement(plan, selectedModel);
  }, [plan, selectedModel]);
  const customization: CABNCustomization = normalizeCABNCustomization(
    plan?.customization ?? null,
  );
  const placementResult = useMemo(() => {
    if (!plan || !placement) return null;
    return yardFitScore({
      parcelGeometry: plan.lot.boundary,
      existingStructures: (plan.lot.structures ?? []).map(
        (structure) => structure.footprint,
      ),
      existingStructuresAvailable: Boolean(plan.lot.structuresAvailable),
      placement: roomPlacementToCABNPlacement(placement),
      model: selectedModel,
      accessPathKnown: false,
      utilityTieInLikely: undefined,
    });
  }, [placement, plan, selectedModel]);
  const feasibilityResult = useMemo(() => {
    if (!plan || !placement || !placementResult) return null;
    return evaluateCABNFeasibility({
      lot: plan.lot,
      model: selectedModel,
      placement: roomPlacementToCABNPlacement(placement),
      placementResult,
      existingStructures: (plan.lot.structures ?? []).map(
        (structure) => structure.footprint,
      ),
      existingStructuresAvailable: Boolean(plan.lot.structuresAvailable),
      jurisdictionStatus: "unknown",
    });
  }, [placement, placementResult, plan, selectedModel]);

  useEffect(() => {
    let active = true;
    window.setTimeout(() => {
      if (active) setPlan(readSelectedRoomPlan());
    }, 0);

    return () => {
      active = false;
    };
  }, []);

  function handleContactTony() {
    if (!plan || !placement || !feasibilityResult) return;
    if (feasibilityResult.overallStatus === "unlikely") return;

    const body = [
      "Hi Tony,",
      "",
      "I would like to review this CABN plan:",
      "",
      `Feasibility: ${feasibilityStatusLabel(feasibilityResult.overallStatus)}`,
      `Lot: ${plan.lot.title}`,
      plan.lot.address ? `Address: ${plan.lot.address}` : undefined,
      plan.lot.acreage ? `Lot size: ${formatAcres(plan.lot.acreage)}` : undefined,
      `Selected room: ${selectedModel.name} (${selectedModel.widthFt} x ${selectedModel.lengthFt} ft)`,
      `Rotation: ${Math.round(placement.rotationDeg)} degrees`,
      "",
      "Customization:",
      `- Window: ${wallLabel(customization.windowWall)}`,
      `- Door: ${wallLabel(customization.doorWall)}`,
      `- Desk: ${wallLabel(customization.deskWall)}`,
      `- Built-ins: ${wallLabel(customization.builtInsWall)}`,
      `- Major view: ${wallLabel(customization.majorViewWall)}`,
      "",
      "Rule summary:",
      ...feasibilityResult.rules.map(
        (rule) => `- ${rule.label}: ${feasibilityStatusLabel(rule.status)} - ${rule.message}`,
      ),
      "",
      typeof window !== "undefined" ? `Tonyville link: ${window.location.href}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    window.location.assign(`mailto:tony@tonysmoller.com?subject=${encodeURIComponent(
      "Tonyville CABN plan review",
    )}&body=${encodeURIComponent(body)}`);
  }

  if (!plan || !placement || !placementResult || !feasibilityResult) {
    return recoveryPanel();
  }

  return (
    <SceneShell
      step={flowStepNumber("review")}
      title="Review"
      helper="Your CABN, your property, one plan."
      backHref="/edit-cabn?scene=built-ins"
      continueLabel="Contact Tony"
      onContinue={handleContactTony}
      continueDisabled={feasibilityResult.overallStatus === "unlikely"}
      secondary={
        <span>No legal approval is implied by this screen.</span>
      }
      visual={
        <CabnInteriorPreview
          model={selectedModel}
          customization={customization}
          compact
        />
      }
    >
      <div className="grid gap-2.5">
        <div
          className={`rounded-[22px] border p-5 ${feasibilityTone(feasibilityResult.overallStatus)}`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.08em] opacity-75">
            Feasibility
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {feasibilityDisplay(feasibilityResult.overallStatus)}
          </div>
          <p className="mt-2 text-sm font-medium leading-6">
            {feasibilityResult.summary}
          </p>
        </div>

        <div className="rounded-[22px] border border-hairline bg-surface p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base font-semibold">{selectedModel.name}</span>
            <span className="text-sm text-ink-soft">
              {selectedModel.widthFt} × {selectedModel.lengthFt} ft · {Math.round(placement.rotationDeg)}°
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-hairline pt-3">
            <span className="min-w-0 truncate text-base font-semibold">
              {plan.lot.title}
            </span>
            <span className="shrink-0 text-sm text-ink-soft">
              {plan.lot.acreage ? formatAcres(plan.lot.acreage) : "—"}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-ink-soft">
            {plan.lot.address ?? "Address unavailable"}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            ["Window", customization.windowWall],
            ["Door", customization.doorWall],
            ["Desk", customization.deskWall],
            ["Built-ins", customization.builtInsWall],
          ].map(([label, wall]) => (
            <div
              key={label}
              className="rounded-[18px] border border-hairline bg-surface p-3 text-center"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
                {label}
              </div>
              <div className="mt-1 text-sm font-semibold">
                {wall ? `${wall[0]?.toUpperCase()}${wall.slice(1)}` : "—"}
              </div>
            </div>
          ))}
        </div>

        <details className="rounded-[22px] border border-hairline bg-surface">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ink">
            Rule evidence
          </summary>
          <div className="grid gap-2.5 border-t border-hairline px-5 py-4">
            {feasibilityResult.rules.map((rule) => (
              <div key={rule.ruleId} className="rounded-2xl bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold">{rule.label}</div>
                  <div className="shrink-0 text-xs font-semibold text-ink-soft">
                    {feasibilityDisplay(rule.status)}
                  </div>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-ink-soft">
                  {rule.message}
                </p>
              </div>
            ))}
            <p className="text-sm font-semibold leading-6 text-brand">
              The GUI earns confidence. The Project Confirmation Visit earns certainty.
            </p>
          </div>
        </details>

        {feasibilityResult.overallStatus === "unlikely" ? (
          <p className="rounded-[22px] bg-[#fff0ed] p-4 text-sm font-semibold leading-6 text-[#8b3f35]">
            This plan is currently unlikely. Manual review is recommended before
            accepting a reservation.
          </p>
        ) : null}
      </div>
    </SceneShell>
  );
}
