import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  BriefcaseBusiness,
  Camera,
  Dumbbell,
  Home,
  KeyRound,
  MapPinned,
  Palette,
  PanelsTopLeft,
  ShieldCheck,
  Sparkles,
  Sun,
  TreePine,
  type LucideIcon,
} from "lucide-react";
import {
  cabnScenes,
  getCabnScene,
  getSceneOption,
  type CABNSceneOption,
} from "@/lib/cabnScenes";
import { getCabnModel } from "@/lib/cabnModels";
import { formatCurrency } from "@/lib/format";
import { buttonClass } from "@/components/ui/Button";
import { optionCardClass } from "@/components/ui/OptionCard";
import { Pill } from "@/components/ui/Pill";

type BuildCabnPlanStartProps = {
  initialUseCase?: string | string[];
  initialStyle?: string | string[];
};

const iconMap: Record<string, LucideIcon> = {
  briefcase: BriefcaseBusiness,
  bed: BedDouble,
  camera: Camera,
  dumbbell: Dumbbell,
  key: KeyRound,
  palette: Palette,
};

const phaseTwoIcons = [Sun, TreePine, MapPinned, PanelsTopLeft];

function encoded(value: string) {
  return encodeURIComponent(value);
}

function metadataString(
  option: CABNSceneOption | undefined,
  key: string,
  fallback: string,
) {
  const value = option?.metadata?.[key];
  return typeof value === "string" ? value : fallback;
}

function metadataStringArray(
  option: CABNSceneOption | undefined,
  key: string,
  fallback: string[],
) {
  const value = option?.metadata?.[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : fallback;
}

function optionAccentClass(option: CABNSceneOption) {
  const value = option.metadata?.accentClass;
  return typeof value === "string" ? value : "bg-[#e8e8e2]";
}

export function BuildCabnPlanStart({
  initialUseCase,
  initialStyle,
}: BuildCabnPlanStartProps) {
  const useCaseScene = getCabnScene("dream_use_case");
  const recommendationScene = getCabnScene("dream_recommendation");
  const styleScene = getCabnScene("dream_style");
  const propertyCtaScene = getCabnScene("dream_property_cta");
  const activeUseCase = getSceneOption("dream_use_case", initialUseCase);
  const recommendedStyle = metadataString(
    activeUseCase,
    "recommendedStyle",
    "modern",
  );
  const selectedStyle =
    getSceneOption("dream_style", initialStyle) ??
    getSceneOption("dream_style", recommendedStyle);
  const selectedModel = getCabnModel(
    metadataString(activeUseCase, "modelId", "cabn-160"),
  );
  const styleIsRecommended = selectedStyle?.id === recommendedStyle;
  const propertyFitHref = `/property-fit?model=${selectedModel.id}&use=${encoded(
    activeUseCase?.id ?? "office",
  )}&style=${encoded(selectedStyle?.id ?? recommendedStyle)}`;
  const landSearchModelSize = ([120, 140, 160, 200] as number[]).includes(
    selectedModel.squareFeet,
  )
    ? selectedModel.squareFeet
    : 200;
  const landSearchHref = `/find-land?model=${landSearchModelSize}`;
  const headline = metadataString(
    activeUseCase,
    "headline",
    "A focused workroom that feels separate from the house.",
  );
  const description = metadataString(
    activeUseCase,
    "description",
    "A calm, bright backyard room with the right feeling before property constraints enter.",
  );
  const imageAlt = metadataString(activeUseCase, "imageAlt", headline);
  const details = metadataStringArray(activeUseCase, "details", [
    "CABN room",
    "Guided placement",
    "Property-aware",
  ]);
  const phaseTwoScenes = cabnScenes
    .filter((scene) => scene.phase === "make_it_yours")
    .slice(0, 4);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
              <Home className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="font-display text-base font-medium">Tonyville</div>
              <div className="text-xs font-medium text-ink-faint">
                Phase 1 Dream · Phase 2 Make It Yours
              </div>
            </div>
          </div>
          <Link
            href={landSearchHref}
            className={buttonClass("secondary", "md", "hidden sm:inline-flex")}
          >
            Need land first?
          </Link>
        </header>

        <div className="grid flex-1 gap-8 py-9 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div className="max-w-2xl">
            <Pill className="mb-5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Phase 1 · Dream
            </Pill>
            <h1 className="font-display text-5xl font-medium leading-[0.98] tracking-[-0.02em] text-ink sm:text-7xl">
              {useCaseScene?.question ?? useCaseScene?.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-soft">
              {useCaseScene?.subtitle}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {useCaseScene?.options?.map((option) => {
                const Icon = iconMap[option.icon ?? "briefcase"] ?? BriefcaseBusiness;
                const active = option.id === activeUseCase?.id;

                return (
                  <Link
                    key={option.id}
                    href={`/?use=${encoded(option.id)}`}
                    scroll={false}
                    aria-current={active ? "true" : undefined}
                    className={`group min-h-24 rounded-[24px] border p-4 text-left transition duration-200 hover:-translate-y-1 ${
                      active
                        ? "border-[#203b2c] bg-[#203b2c] text-white shadow-[0_18px_45px_rgba(32,59,44,0.22)]"
                        : "border-white/80 bg-white/86 text-ink shadow-[0_14px_35px_rgba(22,24,23,0.07)]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                          active ? "bg-white/14" : "bg-[#eef3ef]"
                        }`}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="font-semibold">{option.label}</div>
                        <p className="mt-1 text-sm leading-5 opacity-75">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-[34px] border border-white/80 bg-white/92 shadow-[0_30px_90px_rgba(22,24,23,0.16)] backdrop-blur-xl">
            <div
              aria-label={imageAlt}
              role="img"
              className="relative min-h-[320px] overflow-hidden bg-[#dfe8e3]"
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center transition duration-500"
                style={{ backgroundImage: `url(${activeUseCase?.image})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111817]/70 via-[#111817]/10 to-transparent" />
              <div className="absolute left-5 top-5 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase text-brand shadow-sm">
                {recommendationScene?.title}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white sm:p-7">
                <div className="max-w-xl">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {details.map((detail) => (
                      <span
                        key={detail}
                        className="rounded-full bg-white/18 px-3 py-1 text-xs font-semibold backdrop-blur"
                      >
                        {detail}
                      </span>
                    ))}
                  </div>
                  <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
                    {headline}
                  </h2>
                  <p className="mt-3 max-w-lg text-sm font-medium leading-6 text-white/82 sm:text-base">
                    {description}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] bg-sunken p-4">
                  <div className="text-[10px] font-semibold uppercase text-ink-faint">
                    Recommended model
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {selectedModel.name}
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink-soft">
                    {selectedModel.widthFt} x {selectedModel.lengthFt} ft ·{" "}
                    {selectedModel.squareFeet} sq ft
                  </div>
                </div>
                <div className="rounded-[22px] bg-sunken p-4">
                  <div className="text-[10px] font-semibold uppercase text-ink-faint">
                    Starting price
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {selectedModel.basePrice
                      ? formatCurrency.format(selectedModel.basePrice)
                      : "Pricing review"}
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink-soft">
                    Site work and permits separate
                  </div>
                </div>
                <div className="rounded-[22px] bg-sunken p-4">
                  <div className="text-[10px] font-semibold uppercase text-ink-faint">
                    Best-fit style
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {selectedStyle?.label}
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink-soft">
                    {styleIsRecommended ? "Tonyville recommended" : "Custom direction"}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#27302b]">
                      {styleScene?.title}
                    </div>
                    <p className="mt-1 text-sm font-medium text-ink-soft">
                      {styleScene?.subtitle}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-5">
                  {styleScene?.options?.map((style) => {
                    const active = style.id === selectedStyle?.id;

                    return (
                      <Link
                        key={style.id}
                        href={`/?use=${encoded(activeUseCase?.id ?? "office")}&style=${encoded(
                          style.id,
                        )}`}
                        scroll={false}
                        aria-current={active ? "true" : undefined}
                        className={`rounded-[22px] border p-3 text-left transition duration-200 hover:-translate-y-0.5 ${
                          active
                            ? "border-[#203b2c] bg-white shadow-[0_14px_34px_rgba(22,24,23,0.10)]"
                            : "border-[#e6e9e4] bg-[#fbfaf7]"
                        }`}
                      >
                        <div className={`mb-3 h-9 rounded-2xl ${optionAccentClass(style)}`} />
                        <div className="text-sm font-semibold text-ink">
                          {style.label}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-soft">
                          {style.description}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[26px] border border-[#e8ece6] bg-[#fbfaf7] p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-[#2b6f83]">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Phase 2 · Make It Yours
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  {phaseTwoScenes.map((scene, index) => {
                    const Icon = phaseTwoIcons[index] ?? MapPinned;

                    return (
                      <div key={scene.id} className="rounded-2xl bg-white p-3">
                        <Icon className="mb-3 h-5 w-5 text-brand" aria-hidden="true" />
                        <div className="text-sm font-semibold">{scene.title}</div>
                        <p className="mt-1 text-xs leading-5 text-ink-soft">
                          {scene.dataObjective}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-sm font-medium leading-6 text-ink-soft">
                  {propertyCtaScene?.philosophicalObjective} Next, Tonyville asks
                  for the property context and guides placement before feasibility.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Link
                  href={propertyFitHref}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#203b2c] px-5 text-base font-semibold text-white shadow-[0_18px_45px_rgba(32,59,44,0.22)] transition hover:-translate-y-0.5 hover:bg-[#2e523e]"
                >
                  {propertyCtaScene?.title}
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
                <Link
                  href={landSearchHref}
                  className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#eef3ef] px-5 text-sm font-semibold text-brand transition hover:-translate-y-0.5 hover:bg-[#e4ece6]"
                >
                  Help me find land
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
