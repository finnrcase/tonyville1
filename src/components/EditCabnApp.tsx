"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Home,
  PanelsTopLeft,
  Square,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { CabnInteriorPreview } from "@/components/CabnInteriorPreview";
import { getCabnModel } from "@/lib/cabnModels";
import { getCabnScene } from "@/lib/cabnScenes";
import {
  CABN_WALLS,
  createFallbackRoomPlacement,
  DEFAULT_CABN_CUSTOMIZATION,
  normalizeCABNCustomization,
  readSelectedRoomPlan,
  saveSelectedRoomCustomization,
  saveSelectedRoomPlacement,
  type CABNCustomization,
  type CABNWall,
  type RoomPlacement,
  type SelectedRoomPlan,
} from "@/lib/placeRoom";

type CustomizationKey = keyof CABNCustomization;

type CustomizationSection = {
  key: CustomizationKey;
  title: string;
  description: string;
  icon: LucideIcon;
};

const customizationSections: CustomizationSection[] = [
  {
    key: "windowWall",
    title: "Window Position",
    description: "Choose the wall that should gather light and frame the yard.",
    icon: Square,
  },
  {
    key: "doorWall",
    title: "Door Position",
    description: "Choose the wall that best connects to access and arrival.",
    icon: ArrowRight,
  },
  {
    key: "deskWall",
    title: "Desk Position",
    description: "Choose the wall where the primary work surface should sit.",
    icon: Table2,
  },
  {
    key: "builtInsWall",
    title: "Built-ins Position",
    description: "Choose the wall that should carry storage, shelving, or millwork.",
    icon: PanelsTopLeft,
  },
];

function wallLabel(wall: CABNWall) {
  return `${wall[0].toUpperCase()}${wall.slice(1)} Wall`;
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
          Choose a land parcel or search an owned property, then place your CABN
          before editing the room.
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

export function EditCabnApp() {
  const [hasLoadedPlan, setHasLoadedPlan] = useState(false);
  const [plan, setPlan] = useState<SelectedRoomPlan | null>(null);
  const [customization, setCustomization] = useState<CABNCustomization>(
    DEFAULT_CABN_CUSTOMIZATION,
  );
  const editScene = getCabnScene("edit_cabn");
  const selectedModel = useMemo(
    () => getCabnModel(plan?.modelId ?? "cabn-160"),
    [plan?.modelId],
  );
  const placement: RoomPlacement | null = useMemo(() => {
    if (!plan) return null;
    return plan.placement ?? createFallbackRoomPlacement(plan, selectedModel);
  }, [plan, selectedModel]);
  const placementInferred = Boolean(plan && !plan.placement);

  useEffect(() => {
    let active = true;
    window.setTimeout(() => {
      if (!active) return;
      const selectedPlan = readSelectedRoomPlan();
      setPlan(selectedPlan);
      setCustomization(
        normalizeCABNCustomization(selectedPlan?.customization ?? null),
      );
      setHasLoadedPlan(true);
    }, 0);

    return () => {
      active = false;
    };
  }, []);

  function updateCustomization(key: CustomizationKey, wall: CABNWall) {
    setCustomization((current) => {
      const next = normalizeCABNCustomization({
        ...current,
        [key]: wall,
      });
      saveSelectedRoomCustomization(next);
      return next;
    });
  }

  function handleContinue() {
    saveSelectedRoomCustomization(customization);
    if (placementInferred && placement) {
      saveSelectedRoomPlacement(placement);
    }
    window.location.assign("/review-cabn-plan");
  }

  if (!hasLoadedPlan) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] p-5 text-[#111817]">
        <div className="w-full max-w-sm rounded-[32px] border border-white/80 bg-white p-6 text-center shadow-[0_28px_90px_rgba(22,24,23,0.14)]">
          <div className="mx-auto h-2 w-28 overflow-hidden rounded-full bg-[#edf0ec]">
            <div className="soft-pulse h-full w-1/2 rounded-full bg-[#203b2c]" />
          </div>
          <h1 className="mt-5 text-xl font-semibold">Loading room plan</h1>
          <p className="mt-2 text-sm leading-6 text-[#66716a]">
            Preparing the selected lot, room placement, and orientation.
          </p>
        </div>
      </main>
    );
  }

  if (!plan || !placement) return recoveryPanel();

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-[#111817]">
      <div className="grid min-h-screen lg:grid-cols-[430px_minmax(0,1fr)]">
        <aside className="order-2 flex max-h-none flex-col border-r border-[#e7ebe5] bg-white/96 p-5 shadow-[18px_0_55px_rgba(22,24,23,0.07)] lg:order-1 lg:max-h-screen">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/place-room"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#f7f6f2] px-3 text-sm font-semibold text-[#27302b] transition hover:bg-[#eef3ef]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Placement
            </Link>
            <span className="rounded-full bg-[#eef7f8] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#2b6f83]">
              Scene 8
            </span>
          </div>

          <div className="mt-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#eef3ef] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#203b2c]">
              <Compass className="h-3.5 w-3.5" aria-hidden="true" />
              Property-aware customization
            </div>
            <h1 className="text-4xl font-semibold tracking-[-0.02em]">
              {editScene?.title ?? "Edit Your CABN"}
            </h1>
            <p className="mt-4 text-sm font-medium leading-6 text-[#66716a]">
              {editScene?.subtitle ??
                "Now that we know where your CABN sits, choose how it should face the sun, views, privacy, and access."}
            </p>
            <div className="mt-5 grid gap-2 rounded-[24px] bg-[#f7f6f2] p-4 text-sm leading-6 text-[#56625c]">
              <p>North is based on your property orientation.</p>
              <p>
                These choices can be adjusted during your Project Confirmation
                Visit.
              </p>
              {placementInferred ? (
                <p className="font-semibold text-[#715520]">
                  Placement was inferred from the lot center. Back up to confirm
                  exact placement if needed.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-7 flex-1 overflow-y-auto pr-1 premium-scrollbar">
            <div className="grid gap-4 pb-5">
              {customizationSections.map((section) => {
                const Icon = section.icon;
                const selectedWall = customization[section.key];

                return (
                  <section
                    key={section.key}
                    className="rounded-[26px] border border-[#edf0eb] bg-white p-4 shadow-[0_14px_38px_rgba(22,24,23,0.06)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f0f4ef] text-[#203b2c]">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold">{section.title}</h2>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-[#66716a]">
                          {section.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {CABN_WALLS.map((wall) => {
                        const active = selectedWall === wall;

                        return (
                          <button
                            key={wall}
                            type="button"
                            onClick={() => updateCustomization(section.key, wall)}
                            className={`flex min-h-12 items-center justify-between rounded-2xl border px-3 text-left text-sm font-semibold transition hover:-translate-y-0.5 ${
                              active
                                ? "border-[#203b2c] bg-[#203b2c] text-white shadow-[0_12px_24px_rgba(32,59,44,0.18)]"
                                : "border-[#e8ece6] bg-[#fbfaf7] text-[#27302b]"
                            }`}
                          >
                            {wallLabel(wall)}
                            {active ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-5 mt-3 border-t border-[#edf0eb] bg-white/96 px-5 pb-1 pt-3 shadow-[0_-18px_38px_rgba(22,24,23,0.06)]">
            <button
              type="button"
              onClick={handleContinue}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#203b2c] px-5 text-base font-semibold text-white shadow-[0_18px_45px_rgba(32,59,44,0.18)] transition hover:-translate-y-0.5 hover:bg-[#2e523e]"
            >
              Review CABN Plan
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </aside>

        <section className="order-1 flex min-h-[58vh] items-center justify-center p-5 sm:p-8 lg:order-2 lg:min-h-screen">
          <div className="w-full max-w-6xl">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7a827c]">
                  Design Your CABN
                </div>
                <h2 className="mt-2 text-2xl font-semibold">
                  {selectedModel.name} on {plan.lot.title}
                </h2>
              </div>
            </div>
            <CabnInteriorPreview
              model={selectedModel}
              customization={customization}
              placementInferred={placementInferred}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
