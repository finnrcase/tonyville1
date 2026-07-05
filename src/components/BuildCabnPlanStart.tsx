"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BedDouble,
  BriefcaseBusiness,
  Camera,
  Dumbbell,
  KeyRound,
  Palette,
  type LucideIcon,
} from "lucide-react";
import page1photo from "../../page1photo.png";
import { SceneOption } from "@/components/flow/SceneOption";
import { SceneShell } from "@/components/flow/SceneShell";
import { flowStepNumber } from "@/lib/flowSteps";
import {
  getCabnScene,
  getSceneOption,
  type CABNSceneOption,
} from "@/lib/cabnScenes";
import { getCabnModel } from "@/lib/cabnModels";
import { formatCurrency } from "@/lib/format";

/**
 * Scenes 1–2 of the staged flow: choose a use case (auto-advances), then see
 * the recommended CABN with one clear next action.
 */

type BuildCabnPlanStartProps = {
  initialUseCase?: string | string[];
};

const iconMap: Record<string, LucideIcon> = {
  briefcase: BriefcaseBusiness,
  bed: BedDouble,
  camera: Camera,
  dumbbell: Dumbbell,
  key: KeyRound,
  palette: Palette,
};

const AUTO_ADVANCE_MS = 450;

function metadataString(
  option: CABNSceneOption | undefined,
  key: string,
  fallback: string,
) {
  const value = option?.metadata?.[key];
  return typeof value === "string" ? value : fallback;
}

function labelForUseCase(option: CABNSceneOption) {
  if (option.id === "guest-room") return "Guest Room";
  if (option.id === "rental") return "Rental / ADU";
  if (option.id === "creative-space") return "Creative Space";
  return option.label;
}

export function BuildCabnPlanStart({ initialUseCase }: BuildCabnPlanStartProps) {
  const useCaseScene = getCabnScene("dream_use_case");
  const options = useCaseScene?.options ?? [];
  const initialOption = getSceneOption("dream_use_case", initialUseCase);
  const hasDeepLink = typeof initialUseCase === "string" && initialUseCase.length > 0;

  const [useCaseId, setUseCaseId] = useState(initialOption?.id ?? "office");
  const [scene, setScene] = useState<"use-case" | "recommended">(
    hasDeepLink ? "recommended" : "use-case",
  );
  const advanceTimer = useRef<number | null>(null);

  const activeOption =
    options.find((option) => option.id === useCaseId) ?? initialOption;
  const recommendedStyle = metadataString(activeOption, "recommendedStyle", "modern");
  const selectedModel = getCabnModel(
    metadataString(activeOption, "modelId", "cabn-160"),
  );
  const headline = metadataString(
    activeOption,
    "headline",
    "A focused room that feels separate from the house.",
  );
  const startingPrice = selectedModel.basePrice
    ? formatCurrency.format(selectedModel.basePrice)
    : "Pricing review";
  const propertyFitHref = `/property-fit?model=${selectedModel.id}&use=${encodeURIComponent(
    useCaseId,
  )}&style=${encodeURIComponent(recommendedStyle)}`;
  const landSearchModelSize = ([120, 140, 160, 200] as number[]).includes(
    selectedModel.squareFeet,
  )
    ? selectedModel.squareFeet
    : 200;

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("use", useCaseId);
    window.history.replaceState(null, "", url.toString());
  }, [useCaseId]);

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current);
      }
    };
  }, []);

  function handleSelectUseCase(id: string) {
    setUseCaseId(id);
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
    }
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      setScene("recommended");
    }, AUTO_ADVANCE_MS);
  }

  const visual = (
    <div className="relative h-full w-full">
      <Image
        src={page1photo}
        alt={headline}
        fill
        priority
        sizes="(min-width: 1024px) 60vw, 100vw"
        className="object-cover"
      />
      {scene === "recommended" ? (
        <div className="absolute inset-x-4 bottom-4 rounded-[24px] border border-white/45 bg-[#fbf7ed]/90 p-5 shadow-[0_24px_70px_rgba(22,24,23,0.18)] backdrop-blur-md sm:inset-x-auto sm:right-6 sm:w-[320px]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Recommended
          </div>
          <div className="mt-1 text-2xl font-semibold text-ink">
            {selectedModel.name}
          </div>
          <p className="mt-2 text-sm font-medium leading-6 text-ink-soft">
            {selectedModel.widthFt} × {selectedModel.lengthFt} ft ·{" "}
            {selectedModel.squareFeet} sq ft
          </p>
        </div>
      ) : null}
    </div>
  );

  if (scene === "use-case") {
    return (
      <SceneShell
        step={flowStepNumber("use-case")}
        title="Choose your room"
        helper="What will your extra space become?"
        visual={visual}
        continueLabel="Continue"
        onContinue={() => setScene("recommended")}
      >
        <div className="grid gap-2.5">
          {options.map((option) => {
            const Icon = iconMap[option.icon ?? "briefcase"] ?? BriefcaseBusiness;
            return (
              <SceneOption
                key={option.id}
                label={labelForUseCase(option)}
                icon={<Icon className="h-5 w-5" aria-hidden="true" />}
                selected={option.id === useCaseId}
                onSelect={() => handleSelectUseCase(option.id)}
              />
            );
          })}
        </div>
      </SceneShell>
    );
  }

  return (
    <SceneShell
      step={flowStepNumber("recommended")}
      title={`Your ${selectedModel.name}`}
      helper={headline}
      visual={visual}
      onBack={() => setScene("use-case")}
      continueLabel="See it on my property"
      continueHref={propertyFitHref}
      secondary={
        <Link
          href={`/find-land?model=${landSearchModelSize}`}
          className="font-semibold text-brand underline-offset-4 hover:underline"
        >
          Help me find land instead
        </Link>
      }
    >
      <div className="grid gap-2.5">
        <div className="rounded-[22px] border border-hairline bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-faint">
              Size
            </span>
            <span className="text-base font-semibold">
              {selectedModel.widthFt} × {selectedModel.lengthFt} ft · {selectedModel.squareFeet} sq ft
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-hairline pt-3">
            <span className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-faint">
              Starting at
            </span>
            <span className="text-base font-semibold">{startingPrice}</span>
          </div>
          <p className="mt-3 border-t border-hairline pt-3 text-sm text-ink-soft">
            Site work and permits separate.
          </p>
        </div>
      </div>
    </SceneShell>
  );
}
