import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  BriefcaseBusiness,
  Camera,
  Dumbbell,
  KeyRound,
  Palette,
  type LucideIcon,
} from "lucide-react";
import page1photo from "../../page1photo.png";
import {
  getCabnScene,
  getSceneOption,
  type CABNSceneOption,
} from "@/lib/cabnScenes";
import { getCabnModel } from "@/lib/cabnModels";
import { formatCurrency } from "@/lib/format";
import { buttonClass } from "@/components/ui/Button";
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

function homepageUseCaseLabel(option: CABNSceneOption) {
  if (option.id === "guest-room") return "Guest Room";
  if (option.id === "rental") return "Rental / ADU";
  if (option.id === "creative-space") return "Creative Space";
  return option.label;
}

export function BuildCabnPlanStart({
  initialUseCase,
  initialStyle,
}: BuildCabnPlanStartProps) {
  const useCaseScene = getCabnScene("dream_use_case");
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
  const startingPrice = selectedModel.basePrice
    ? formatCurrency.format(selectedModel.basePrice)
    : "Pricing review";

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <section className="mx-auto grid min-h-screen w-full max-w-[1440px] gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-12 lg:px-10">
        <div className="mx-auto flex w-full max-w-xl flex-col lg:mx-0">
          <Link
            href="/"
            className="mb-14 text-sm font-semibold uppercase tracking-[0.34em] text-brand"
            aria-label="CABN home"
          >
            CABN
          </Link>

          <div>
            <Pill className="mb-6 bg-surface/80">PHASE 1 · DREAM</Pill>
            <h1 className="max-w-[11ch] font-sans text-5xl font-medium leading-[0.95] text-ink sm:text-6xl xl:text-7xl">
              What do you want your extra space to become?
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-soft">
              Start with a room. We&apos;ll help you fit it to your property.
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
                    className={[
                      "group block min-h-[104px] rounded-[24px] p-4 text-left transition duration-200 hover:-translate-y-0.5",
                      active
                        ? "bg-brand text-white shadow-[0_22px_46px_rgba(34,64,47,0.22)]"
                        : "border border-hairline bg-surface text-ink shadow-[0_10px_30px_rgba(22,24,23,0.035)] hover:bg-white",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={[
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition",
                          active
                            ? "bg-white/14 text-white"
                            : "bg-sunken text-brand group-hover:bg-[#e7efe7]",
                        ].join(" ")}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="font-semibold">
                          {homepageUseCaseLabel(option)}
                        </div>
                        <p
                          className={[
                            "mt-1 text-sm leading-5",
                            active ? "text-white/78" : "text-ink-soft",
                          ].join(" ")}
                        >
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_0.72fr]">
              <Link href={propertyFitHref} className={buttonClass("primary", "lg", "w-full")}>
                See how this fits my property
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link
                href={landSearchHref}
                className={buttonClass(
                  "secondary",
                  "lg",
                  "w-full bg-[#fbf7ed] text-brand hover:bg-white",
                )}
              >
                Help me find land
              </Link>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl lg:mx-0">
          <div className="relative min-h-[520px] overflow-hidden rounded-[36px] bg-sunken shadow-[0_34px_90px_rgba(22,24,23,0.12)] sm:min-h-[640px]">
            <Image
              src={page1photo}
              alt={headline}
              fill
              priority
              sizes="(min-width: 1024px) 54vw, 100vw"
              className="object-cover"
              placeholder="blur"
            />

            <div className="absolute inset-x-4 bottom-4 rounded-[28px] border border-white/45 bg-[#fbf7ed]/88 p-5 shadow-[0_24px_70px_rgba(22,24,23,0.18)] backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[340px] sm:p-6">
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                    Recommended Model
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-ink">
                    {selectedModel.name}
                  </div>
                </div>
                <div className="border-t border-hairline pt-4 text-sm font-medium leading-6 text-ink-soft">
                  <p>
                    {selectedModel.widthFt} × {selectedModel.lengthFt} ft ·{" "}
                    {selectedModel.squareFeet} sq ft
                  </p>
                  <p>Starting at {startingPrice}</p>
                  <p>Site work and permits separate</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
