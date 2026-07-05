"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import { CabnInteriorPreview } from "@/components/CabnInteriorPreview";
import { SceneOption } from "@/components/flow/SceneOption";
import { SceneShell } from "@/components/flow/SceneShell";
import { buttonClass } from "@/components/ui/Button";
import { getCabnModel } from "@/lib/cabnModels";
import { flowStepNumber } from "@/lib/flowSteps";
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

/**
 * Edit CABN as a staged flow: one wall question per scene (window → door →
 * desk → built-ins) with the interior preview holding steady on the right.
 * Selecting a wall saves immediately and auto-advances; customization state
 * persists exactly as before via placeRoom storage.
 */

type CustomizationKey = keyof Pick<
  CABNCustomization,
  "windowWall" | "doorWall" | "deskWall" | "builtInsWall"
>;

type WallScene = {
  key: CustomizationKey;
  flowId: string;
  title: string;
  helper: string;
};

const WALL_SCENES: WallScene[] = [
  {
    key: "windowWall",
    flowId: "window",
    title: "Choose window wall",
    helper: "Where the light comes in.",
  },
  {
    key: "doorWall",
    flowId: "door",
    title: "Choose door wall",
    helper: "Where you walk in.",
  },
  {
    key: "deskWall",
    flowId: "desk",
    title: "Choose desk wall",
    helper: "Where you work.",
  },
  {
    key: "builtInsWall",
    flowId: "built-ins",
    title: "Choose built-ins wall",
    helper: "Where storage lives.",
  },
];

const AUTO_ADVANCE_MS = 450;

function wallLabel(wall: CABNWall) {
  return `${wall[0].toUpperCase()}${wall.slice(1)}`;
}

function RecoveryScene() {
  return (
    <main className="flex h-dvh items-center justify-center bg-canvas p-5 text-ink">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white">
          <Home className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-4xl font-medium">Choose a property first</h1>
        <p className="mt-3 text-base leading-6 text-ink-soft">
          Your CABN needs a place to stand.
        </p>
        <div className="mt-8 grid gap-3">
          <Link href="/property-fit" className={buttonClass("primary", "lg", "w-full")}>
            Enter your address
          </Link>
          <Link href="/find-land" className={buttonClass("secondary", "lg", "w-full")}>
            Find land
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
  const [sceneIndex, setSceneIndex] = useState(0);
  const advanceTimer = useRef<number | null>(null);

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
      // Deep link into a specific wall scene (e.g. Back from Review).
      const requestedScene = new URLSearchParams(window.location.search).get(
        "scene",
      );
      const requestedIndex = WALL_SCENES.findIndex(
        (wallScene) => wallScene.flowId === requestedScene,
      );
      if (requestedIndex >= 0) setSceneIndex(requestedIndex);
      setHasLoadedPlan(true);
    }, 0);

    return () => {
      active = false;
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current);
      }
    };
  }, []);

  const scene = WALL_SCENES[sceneIndex];
  const isLastScene = sceneIndex === WALL_SCENES.length - 1;

  function finishToReview() {
    saveSelectedRoomCustomization(customization);
    if (placementInferred && placement) {
      saveSelectedRoomPlacement(placement);
    }
    window.location.assign("/review-cabn-plan");
  }

  function advance() {
    if (isLastScene) {
      finishToReview();
    } else {
      setSceneIndex((index) => Math.min(index + 1, WALL_SCENES.length - 1));
    }
  }

  function handleSelectWall(wall: CABNWall) {
    setCustomization((current) => {
      const next = normalizeCABNCustomization({
        ...current,
        [scene.key]: wall,
      });
      saveSelectedRoomCustomization(next);
      return next;
    });
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
    }
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      advance();
    }, AUTO_ADVANCE_MS);
  }

  function handleBack() {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (sceneIndex === 0) {
      window.location.assign("/place-room");
    } else {
      setSceneIndex((index) => index - 1);
    }
  }

  function handleContinue() {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    advance();
  }

  if (!hasLoadedPlan) {
    return (
      <main className="flex h-dvh items-center justify-center bg-canvas text-ink">
        <div className="text-center">
          <div className="mx-auto h-2 w-28 overflow-hidden rounded-full bg-sunken">
            <div className="soft-pulse h-full w-1/2 rounded-full bg-brand" />
          </div>
          <p className="mt-5 text-base text-ink-soft">Loading your CABN…</p>
        </div>
      </main>
    );
  }

  if (!plan || !placement) return <RecoveryScene />;

  const selectedWall = customization[scene.key];

  return (
    <SceneShell
      step={flowStepNumber(scene.flowId)}
      title={scene.title}
      helper={scene.helper}
      onBack={handleBack}
      continueLabel={isLastScene ? "Review" : "Continue"}
      onContinue={handleContinue}
      visual={
        <CabnInteriorPreview
          model={selectedModel}
          customization={customization}
          placementInferred={placementInferred}
          compact
        />
      }
    >
      <div className="grid gap-2.5">
        {CABN_WALLS.map((wall) => (
          <SceneOption
            key={wall}
            label={wallLabel(wall)}
            selected={selectedWall === wall}
            onSelect={() => handleSelectWall(wall)}
          />
        ))}
      </div>
    </SceneShell>
  );
}
