"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Home,
  Mail,
  ShieldCheck,
  SlidersVertical,
} from "lucide-react";
import { getCabnModel } from "@/lib/cabnModels";
import { getCabnScene } from "@/lib/cabnScenes";
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
  const reviewScene = getCabnScene("feasibility_result");
  const engineScene = getCabnScene("run_feasibility");
  const reservationScene = getCabnScene("project_reservation");
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
    <main className="min-h-screen bg-[#f7f6f2] px-5 py-6 text-[#111817] sm:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-48px)] w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-[36px] border border-white/80 bg-white p-5 shadow-[0_28px_90px_rgba(22,24,23,0.12)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/edit-cabn"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#f7f6f2] px-3 text-sm font-semibold text-[#27302b] transition hover:bg-[#eef3ef]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Edit CABN
            </Link>
            <span className="rounded-full bg-[#eef7f8] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#2b6f83]">
              Review
            </span>
          </div>

          <div className="mt-10 max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#eef3ef] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#203b2c]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {engineScene?.title ?? "CABN Feasibility Engine v0.1"}
            </div>
            <h1 className="text-5xl font-semibold tracking-[-0.03em] sm:text-6xl">
              {reviewScene?.title ?? "Review CABN Plan"}
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-[#66716a]">
              Review the CABN orientation, property context, and early screening
              result before asking Tony to confirm the project path.
            </p>
          </div>

          <div className={`mt-8 rounded-[30px] border p-6 ${feasibilityTone(feasibilityResult.overallStatus)}`}>
            <div className="text-xs font-semibold uppercase opacity-75">
              Feasibility result
            </div>
            <div className="mt-2 text-4xl font-semibold">
              {feasibilityDisplay(feasibilityResult.overallStatus)}
            </div>
            <p className="mt-4 max-w-3xl text-sm font-medium leading-6">
              {feasibilityResult.summary}
            </p>
            <p className="mt-4 rounded-2xl bg-white/60 px-4 py-3 text-sm font-semibold leading-6">
              The GUI earns confidence. The Project Confirmation Visit earns
              certainty.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <section className="rounded-[28px] bg-[#f7f6f2] p-5">
              <div className="text-sm font-semibold text-[#27302b]">
                Selected CABN
              </div>
              <div className="mt-3 text-2xl font-semibold">{selectedModel.name}</div>
              <p className="mt-2 text-sm leading-6 text-[#66716a]">
                {selectedModel.widthFt} x {selectedModel.lengthFt} ft ·{" "}
                {selectedModel.squareFeet} sq ft · {Math.round(placement.rotationDeg)}°
                rotation
              </p>
            </section>
            <section className="rounded-[28px] bg-[#f7f6f2] p-5">
              <div className="text-sm font-semibold text-[#27302b]">
                Selected property
              </div>
              <div className="mt-3 text-2xl font-semibold">{plan.lot.title}</div>
              <p className="mt-2 text-sm leading-6 text-[#66716a]">
                {plan.lot.address ?? "Address unavailable"}
                {plan.lot.acreage ? ` · ${formatAcres(plan.lot.acreage)}` : ""}
              </p>
            </section>
          </div>

          <section className="mt-6 rounded-[30px] bg-[#f7f6f2] p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <SlidersVertical className="h-4 w-4 text-[#203b2c]" aria-hidden="true" />
              Customization choices
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Window", customization.windowWall],
                ["Door", customization.doorWall],
                ["Desk", customization.deskWall],
                ["Built-ins", customization.builtInsWall],
                ["Major view", customization.majorViewWall],
              ].map(([label, wall]) => (
                <div key={label} className="rounded-2xl bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase text-[#7a827c]">
                    {label}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#27302b]">
                    {wallLabel(wall)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-[30px] bg-white p-5 ring-1 ring-[#edf0eb]">
            <div className="text-sm font-semibold text-[#27302b]">Rule evidence</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {feasibilityResult.rules.map((rule) => (
                <div key={rule.ruleId} className="rounded-2xl bg-[#fbfaf7] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold">{rule.label}</div>
                    <div className="text-xs font-semibold text-[#66716a]">
                      {feasibilityDisplay(rule.status)}
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#66716a]">
                    {rule.message}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="flex flex-col gap-4 rounded-[36px] border border-white/80 bg-white p-5 shadow-[0_28px_90px_rgba(22,24,23,0.12)] lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7a827c]">
              Next step
            </div>
            <h2 className="mt-2 text-3xl font-semibold">
              {reservationScene?.title ?? "Project Reservation / Contact Tony"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#66716a]">
              If this plan is Likely or Needs Review, send Tony the property,
              placement, and customization summary for the human review step.
            </p>
          </div>

          <div className="rounded-[26px] bg-[#f7f6f2] p-4 text-sm leading-6 text-[#56625c]">
            <p>{reviewScene?.philosophicalObjective}</p>
            <p className="mt-3 font-semibold text-[#203b2c]">
              No legal approval is implied by this screen.
            </p>
          </div>

          <button
            type="button"
            disabled={feasibilityResult.overallStatus === "unlikely"}
            onClick={handleContactTony}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#203b2c] px-5 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(32,59,44,0.18)] transition hover:-translate-y-0.5 hover:bg-[#2e523e] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            Contact Tony
          </button>

          {feasibilityResult.overallStatus === "unlikely" ? (
            <p className="rounded-2xl bg-[#fff0ed] p-4 text-sm font-semibold leading-6 text-[#8b3f35]">
              This plan is currently unlikely. Manual review is recommended
              before accepting a reservation.
            </p>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
