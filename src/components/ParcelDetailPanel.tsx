"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bookmark,
  Check,
  ClipboardCheck,
  Droplets,
  Home,
  MessageCircle,
  MapPinned,
  Route,
  ShieldCheck,
  TriangleAlert,
  Waves,
  Zap,
} from "lucide-react";
import { formatAcres, formatCurrency, formatMiles } from "@/lib/format";
import { getCabnModel } from "@/lib/cabnModels";
import { OfficialParcelInfo } from "@/components/OfficialParcelInfo";
import { ParcelIntelligence } from "@/components/ParcelIntelligence";
import type { EnrichmentStatus } from "@/lib/enrichmentClient";
import {
  createSelectedRoomPlan,
  parcelToSelectedLot,
  writeSelectedRoomPlan,
} from "@/lib/placeRoom";
import {
  buildCABNScoringInputFromParcel,
  CABN_MODELS,
  cabnCompatibilityScore,
} from "@/lib/scoring/cabnCompatibilityScore";
import type {
  CABNCompatibilityResult,
  ScoreCategory,
} from "@/lib/scoring/cabnCompatibilityScore";
import type {
  FireRiskData,
  FloodRiskData,
  LaCountyParcelData,
  ParcelEnrichment,
  ScoredParcel,
  SoilData,
  USGSTopographyData,
} from "@/types/parcel";

type ParcelDetailPanelProps = {
  parcel?: ScoredParcel;
  saved: boolean;
  saveMode: "supabase" | "local";
  saveMessage?: string;
  onToggleSave: (parcelId: string) => void;
  enrichment?: ParcelEnrichment;
  enrichmentStatus: EnrichmentStatus;
  onContact?: (parcel: ScoredParcel) => void;
};

const cabnCategoryLabels = [
  { key: "geometry", label: "Geometry" },
  { key: "physicalFit", label: "Physical Fit" },
  { key: "topography", label: "Topography" },
  { key: "regulatory", label: "Regulatory" },
  { key: "utilities", label: "Utilities / Existing Conditions" },
  { key: "complexity", label: "Complexity / Confidence" },
] as const;

function ScoreDial({ score, label }: { score: number; label: string }) {
  return (
    <div
      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(#203b2c ${score * 3.6}deg, #edf0ec 0deg)`,
      }}
      aria-label={`${label} ${score}`}
    >
      <div className="flex h-18 w-18 items-center justify-center rounded-full bg-white">
        <span className="font-mono text-3xl font-semibold text-[#203b2c]">
          {score}
        </span>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-[#edf0ec] bg-white p-4 shadow-[0_8px_24px_rgba(22,24,23,0.04)]">
      <h3 className="text-sm font-semibold text-[#111817]">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function FloodSection({
  flood,
  loading,
}: {
  flood?: FloodRiskData;
  loading: boolean;
}) {
  if (loading && !flood) {
    return (
      <DetailSection title="Flood / Regulatory">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-[#edf0ec]" />
      </DetailSection>
    );
  }
  if (!flood) {
    return null;
  }

  const tone =
    flood.riskLevel === "High"
      ? "text-[#8b3f35]"
      : flood.riskLevel === "Medium"
        ? "text-[#8b6b2d]"
        : flood.riskLevel === "Low"
          ? "text-[#203b2c]"
          : "text-[#56605a]";
  const manualReview =
    !flood.available || flood.riskLevel === "High" || flood.riskLevel === "Unknown";

  return (
    <DetailSection title="Flood / Regulatory">
      <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
        <span className="font-medium text-[#66716a]">Flood risk</span>
        <span className={`font-semibold ${tone}`}>
          {flood.riskLevel}
          {flood.floodZone ? ` · ${flood.floodZone}` : ""}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
        <span className="font-medium text-[#66716a]">FEMA source</span>
        <span className="font-semibold text-[#27302b]">
          {flood.source === "FEMA" ? "FEMA NFHL" : "Unavailable"}
        </span>
      </div>
      {flood.notes.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-xs leading-5 text-[#56605a]">
          {flood.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      ) : null}
      {manualReview ? (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#fbf4e9] px-3 py-2 text-xs font-semibold text-[#8b6b2d]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Manual flood review recommended.
        </div>
      ) : null}
      <p className="mt-3 text-[11px] leading-4 text-[#8a938c]">
        Early flood screening from FEMA NFHL — not a final permitting or flood-insurance
        determination.
      </p>
    </DetailSection>
  );
}

function FireRiskSection({
  fireRisk,
  loading,
}: {
  fireRisk?: FireRiskData;
  loading: boolean;
}) {
  if (loading && !fireRisk) {
    return (
      <DetailSection title="Fire Risk">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-[#edf0ec]" />
      </DetailSection>
    );
  }

  if (!fireRisk) {
    return null;
  }

  const tone =
    fireRisk.riskLevel === "Extreme" || fireRisk.riskLevel === "High"
      ? "text-[#8b3f35]"
      : fireRisk.riskLevel === "Medium"
        ? "text-[#8b6b2d]"
        : fireRisk.riskLevel === "Low"
          ? "text-[#203b2c]"
          : "text-[#56605a]";
  const manualReview =
    !fireRisk.available ||
    fireRisk.riskLevel === "Extreme" ||
    fireRisk.riskLevel === "High" ||
    fireRisk.riskLevel === "Unknown";
  const outsideCalFireCoverage = fireRisk.notes.some((note) =>
    note.toLowerCase().includes("outside cal fire coverage"),
  );

  return (
    <DetailSection title="Fire Risk">
      <div className="grid gap-2">
        <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
          <span className="font-medium text-[#66716a]">Fire Hazard Zone</span>
          <span className={`font-semibold ${tone}`}>
            {fireRisk.fireZone ?? "Unknown"}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
          <span className="font-medium text-[#66716a]">Risk Level</span>
          <span className={`font-semibold ${tone}`}>{fireRisk.riskLevel}</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
          <span className="font-medium text-[#66716a]">CAL FIRE source</span>
          <span className="font-semibold text-[#27302b]">
            {fireRisk.source === "CAL FIRE" ? "CAL FIRE FHSZ" : "Unavailable"}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
          <span className="font-medium text-[#66716a]">Confidence</span>
          <span className="font-semibold text-[#27302b]">
            {fireRisk.confidence}
          </span>
        </div>
      </div>

      {fireRisk.notes.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-xs leading-5 text-[#56605a]">
          {fireRisk.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      ) : null}

      {manualReview ? (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#fbf4e9] px-3 py-2 text-xs font-semibold text-[#8b6b2d]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {outsideCalFireCoverage
            ? "Outside CAL FIRE coverage; use a state or local wildfire provider when available."
            : "Additional defensible-space, insurance, access, and permitting review recommended."}
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#eef7f0] px-3 py-2 text-xs font-semibold text-[#203b2c]">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          No major CAL FIRE hazard signal from the early screen.
        </div>
      )}

      <p className="mt-3 text-[11px] leading-4 text-[#8a938c]">
        Early wildfire screening from CAL FIRE Fire Hazard Severity Zones — not a
        final permitting, insurance, or fire-code determination.
      </p>
    </DetailSection>
  );
}

function TopoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2 text-sm">
      <span className="font-medium text-[#66716a]">{label}</span>
      <span className="font-mono font-semibold text-[#111817]">{value}</span>
    </div>
  );
}

function SoilsSection({
  soil,
  loading,
}: {
  soil?: SoilData;
  loading: boolean;
}) {
  if (loading && !soil) {
    return (
      <DetailSection title="Soils & Foundation">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-[#edf0ec]" />
      </DetailSection>
    );
  }

  if (!soil) return null;

  if (!soil.available) {
    return (
      <DetailSection title="Soils & Foundation">
        <p className="text-sm leading-6 text-[#56605a]">
          USDA SSURGO soil data was unavailable. Foundation and septic suitability
          remain unconfirmed.
        </p>
      </DetailSection>
    );
  }

  const warnings = [
    soil.drainageRisk === "High" ? "Drainage review recommended" : undefined,
    soil.septicSuitability === "Poor" || soil.septicSuitability === "Fair"
      ? "Septic feasibility review recommended"
      : undefined,
    soil.foundationSuitability === "Poor" ? "Geotechnical review recommended" : undefined,
    soil.shrinkSwellRisk === "High" ? "Shrink/swell soil risk" : undefined,
  ].filter((item): item is string => Boolean(item));

  return (
    <DetailSection title="Soils & Foundation">
      <div className="grid gap-2">
        <TopoRow label="Soil drainage" value={soil.drainageClass ?? "Unknown"} />
        <TopoRow label="Septic suitability" value={soil.septicSuitability ?? "Unknown"} />
        <TopoRow label="Foundation suitability" value={soil.foundationSuitability ?? "Unknown"} />
        <TopoRow label="Shrink/Swell risk" value={soil.shrinkSwellRisk ?? "Unknown"} />
        <TopoRow label="Erosion risk" value={soil.erosionRisk ?? "Unknown"} />
        <TopoRow
          label="Excavation difficulty"
          value={soil.estimatedExcavationDifficulty ?? "Unknown"}
        />
        <TopoRow label="Confidence" value={soil.confidence} />
      </div>
      <div className="mt-3 grid gap-1 text-xs leading-5 text-[#56605a]">
        {soil.notes.map((note) => (
          <div key={note} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#203b2c]" />
            <span>{note}</span>
          </div>
        ))}
        {warnings.map((warning) => (
          <div key={warning} className="flex items-start gap-2 text-[#8b6b2d]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{warning}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-4 text-[#8a938c]">
        Early soil screening from USDA SSURGO — not a geotechnical, septic, or
        foundation engineering report.
      </p>
    </DetailSection>
  );
}

function LaCountySection({
  parcel,
}: {
  parcel?: LaCountyParcelData;
}) {
  if (!parcel || !parcel.available) return null;

  return (
    <DetailSection title="LA County GIS">
      <div className="grid gap-2">
        {parcel.apn ? <TopoRow label="APN" value={parcel.apn} /> : null}
        {parcel.situsAddress ? <TopoRow label="Situs" value={parcel.situsAddress} /> : null}
        {parcel.useDescription ? (
          <TopoRow label="Use" value={parcel.useDescription} />
        ) : parcel.useType ? (
          <TopoRow label="Use" value={parcel.useType} />
        ) : null}
      </div>
      <p className="mt-3 text-[11px] leading-4 text-[#8a938c]">
        Early parcel screen from LA County GIS. Confirm assessor and zoning records
        before CABN recommendation.
      </p>
    </DetailSection>
  );
}

function TopographySection({
  topo,
  loading,
}: {
  topo?: USGSTopographyData;
  loading: boolean;
}) {
  if (loading && !topo) {
    return (
      <DetailSection title="Topography">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-[#edf0ec]" />
      </DetailSection>
    );
  }
  if (!topo) {
    return null;
  }

  if (!topo.available) {
    return (
      <DetailSection title="Topography">
        <p className="text-sm leading-6 text-[#56605a]">
          USGS elevation data was unavailable for this parcel. Terrain is unconfirmed —
          manual review recommended.
        </p>
        <p className="mt-3 text-[11px] leading-4 text-[#8a938c]">
          Early site-suitability screening from USGS elevation data — not an engineering or
          grading report.
        </p>
      </DetailSection>
    );
  }

  const favorable =
    topo.terrainClass === "Flat" || topo.terrainClass === "Gentle";
  const cues = favorable
    ? [
        `Site is ${(topo.terrainClass ?? "").toLowerCase()}${
          topo.aspect && topo.aspect !== "Mixed"
            ? ` and ${topo.aspect.toLowerCase()}-facing`
            : ""
        }`,
        "Minimal grading expected",
      ]
    : [
        `${topo.terrainClass ?? "Unknown"} terrain${
          topo.aspect && topo.aspect !== "Mixed"
            ? ` (${topo.aspect.toLowerCase()}-facing)`
            : ""
        }`,
        topo.estimatedSiteComplexity === "High"
          ? "Significant grading likely"
          : "Some grading likely",
      ];
  if (topo.drainageRisk && topo.drainageRisk !== "Low") {
    cues.push("Drainage review recommended");
  }

  return (
    <DetailSection title="Topography">
      <div className="grid gap-2">
        {topo.elevationFeet !== undefined ? (
          <TopoRow label="Elevation" value={`${topo.elevationFeet.toLocaleString()} ft`} />
        ) : null}
        {topo.averageSlopePercent !== undefined ? (
          <TopoRow label="Average slope" value={`${topo.averageSlopePercent}%`} />
        ) : null}
        {topo.maxSlopePercent !== undefined ? (
          <TopoRow label="Maximum slope" value={`${topo.maxSlopePercent}%`} />
        ) : null}
        {topo.terrainClass ? (
          <TopoRow label="Terrain class" value={topo.terrainClass} />
        ) : null}
        {topo.aspect ? <TopoRow label="Solar orientation" value={topo.aspect} /> : null}
        {topo.estimatedSiteComplexity ? (
          <TopoRow label="Grading complexity" value={topo.estimatedSiteComplexity} />
        ) : null}
        {topo.drainageRisk ? (
          <TopoRow label="Drainage" value={topo.drainageRisk} />
        ) : null}
        <TopoRow label="Confidence" value={topo.confidence} />
      </div>

      <ul className="mt-3 grid gap-1 text-xs leading-5">
        {cues.map((cue) => (
          <li
            key={cue}
            className={favorable ? "text-[#203b2c]" : "text-[#8b6b2d]"}
          >
            {favorable ? "✓" : "⚠"} {cue}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-4 text-[#8a938c]">
        Early site-suitability screening from USGS elevation data — not an engineering or
        grading report.
      </p>
    </DetailSection>
  );
}

function utilityLabel(enabled: boolean) {
  return enabled ? "Available" : "Needs verification";
}

function permitDifficulty(parcel: ScoredParcel) {
  if (parcel.zoningRisk === "low") {
    return "Lower difficulty";
  }

  if (parcel.zoningRisk === "medium") {
    return "Moderate difficulty";
  }

  return "Higher difficulty";
}

function buildDecisionLabel(canBuild: boolean | "unknown") {
  if (canBuild === true) {
    return "Likely fit";
  }

  if (canBuild === false) {
    return "Not recommended";
  }

  return "Needs confirmation";
}

function confidenceLabel(confidence: CABNCompatibilityResult["confidence"]) {
  return `${confidence} confidence`;
}

function fallbackItems(items: string[], fallback: string) {
  return items.length ? items : [fallback];
}

function categoryTakeaway(category: ScoreCategory) {
  return (
    category.blockers[0] ??
    category.warnings[0] ??
    category.unknowns[0] ??
    category.strengths[0] ??
    "Manual review recommended."
  );
}

function derivedComplexity(score: number, unknowns: string[]) {
  if (unknowns.length >= 3) {
    return "Unknown";
  }

  if (score >= 78) {
    return "Low";
  }

  if (score >= 52) {
    return "Medium";
  }

  return "High";
}

export function ParcelDetailPanel({
  parcel,
  saved,
  saveMode,
  saveMessage,
  onToggleSave,
  enrichment,
  enrichmentStatus,
  onContact,
}: ParcelDetailPanelProps) {
  const [matchOpen, setMatchOpen] = useState(false);
  const cabnCompatibility = useMemo(() => {
    if (!parcel) {
      return null;
    }

    if (!enrichment && parcel.cabnCompatibility) {
      return parcel.cabnCompatibility;
    }

    return cabnCompatibilityScore(
      buildCABNScoringInputFromParcel(parcel, enrichment),
    );
  }, [enrichment, parcel]);

  if (!parcel || !cabnCompatibility) {
    return (
      <aside className="rounded-[32px] border border-white/70 bg-white/95 p-5 shadow-[0_28px_90px_rgba(22,24,23,0.22)] backdrop-blur-2xl">
        <div className="text-sm font-semibold text-[#111817]">No matching lots</div>
        <p className="mt-2 text-sm leading-6 text-[#66716a]">
          Adjust the filters to broaden the current search.
        </p>
      </aside>
    );
  }

  const possibleModelIds = new Set(
    cabnCompatibility.possibleModels.map((model) => model.id),
  );
  const unavailableModels = CABN_MODELS.filter(
    (model) => !possibleModelIds.has(model.id),
  );
  const recommendedModel = cabnCompatibility.recommendedModel;
  const selectedRoomModel = getCabnModel(
    recommendedModel?.sizeSqft ?? parcel.compatibility.selectedModel.size,
  );
  const recommendationReason =
    cabnCompatibility.strengths[0] ??
    cabnCompatibility.categoryScores.physicalFit.strengths[0] ??
    "Manual review recommended before treating this as build-ready.";
  const modelConstraintReason =
    cabnCompatibility.blockers[0] ??
    cabnCompatibility.warnings[0] ??
    cabnCompatibility.unknowns[0] ??
    "No model-specific blocker is known from available data.";
  const knownStrengths = fallbackItems(
    cabnCompatibility.strengths.slice(0, 6),
    "No confirmed strength yet. Treat this as a manual-review candidate.",
  );
  const knownConstraints = fallbackItems(
    [...cabnCompatibility.blockers, ...cabnCompatibility.warnings].slice(0, 6),
    "No major constraint is known from current data.",
  );
  const unknownData = fallbackItems(
    cabnCompatibility.unknowns.slice(0, 6),
    "No major unknown is currently flagged.",
  );
  const utilityComplexity = derivedComplexity(
    cabnCompatibility.categoryScores.utilities.score,
    cabnCompatibility.categoryScores.utilities.unknowns,
  );
  const deliveryComplexity = derivedComplexity(
    cabnCompatibility.categoryScores.physicalFit.score,
    cabnCompatibility.categoryScores.physicalFit.unknowns,
  );

  function handleSelectLot() {
    if (!parcel) return;

    const backHref =
      typeof window === "undefined"
        ? "/find-land"
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const lot = parcelToSelectedLot(parcel, {
      source: "land_search",
      sourceMessage:
        "Selected from Tonyville land search. Parcel geometry and site data remain early-screening inputs.",
      backHref,
    });

    writeSelectedRoomPlan(
      createSelectedRoomPlan({
        lot,
        modelId: selectedRoomModel.id,
      }),
    );
    window.location.assign("/place-room");
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-[32px] border border-white/70 bg-white/95 shadow-[0_28px_90px_rgba(22,24,23,0.22)] backdrop-blur-2xl">
      <div className="overflow-y-auto p-5 premium-scrollbar">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase text-[#6f7b73]">
              Selected lot
            </div>
            <h2 className="mt-1 text-2xl font-semibold leading-8 text-[#111817]">
              {parcel.title}
            </h2>
            <p className="mt-1 text-sm font-medium text-[#66716a]">
              {parcel.address}, {parcel.city}, {parcel.state}
            </p>
          </div>
          <ScoreDial
            score={cabnCompatibility.totalScore}
            label="CABN Compatibility Score"
          />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-[#f7f6f2] px-3 py-3">
            <div className="text-xs font-semibold text-[#6f7b73]">Price</div>
            <div className="mt-1 font-mono text-sm font-semibold text-[#111817]">
              {parcel.priceSource === "unknown" || parcel.price <= 0
                ? "Data unavailable"
                : formatCurrency.format(parcel.price)}
            </div>
          </div>
          <div className="rounded-2xl bg-[#f7f6f2] px-3 py-3">
            <div className="text-xs font-semibold text-[#6f7b73]">Lot</div>
            <div className="mt-1 font-mono text-sm font-semibold text-[#111817]">
              {formatAcres(parcel.acreage)}
            </div>
          </div>
          <div className="rounded-2xl bg-[#f7f6f2] px-3 py-3">
            <div className="text-xs font-semibold text-[#6f7b73]">
              Distance
            </div>
            <div className="mt-1 font-mono text-sm font-semibold text-[#111817]">
              {formatMiles(parcel.distanceMiles)}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <OfficialParcelInfo
            lat={parcel.lat}
            lng={parcel.lng}
            lookupKey={parcel.id}
          />
        </div>

        <div className="mt-5 space-y-4">
          <DetailSection title="Overview">
            <p className="text-sm leading-6 text-[#56605a]">
              {parcel.parcelUse} in {parcel.county} County with{" "}
              {parcel.terrain}. Price basis is {parcel.priceSource}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {parcel.highlights.map((highlight) => (
                <span
                  key={highlight}
                  className="rounded-xl bg-[#eef7f0] px-2 py-1 text-xs font-semibold text-[#203b2c]"
                >
                  {highlight}
                </span>
              ))}
            </div>
          </DetailSection>

          <DetailSection title="Estimated path to build">
            <div className="grid gap-2 text-sm">
              {[
                ["Permitting/review", "2 months"],
                ["Site prep", "TBD"],
                ["Delivery/install", "TBD"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-3"
                >
                  <span className="font-semibold text-[#27302b]">{label}</span>
                  <span className="font-mono text-sm font-semibold text-[#66716a]">
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-[#66716a]">
              Manual review needed. This is an early screening path, not a
              permitting approval or construction schedule.
            </p>
          </DetailSection>

          <ParcelIntelligence
            parcel={parcel}
            enrichment={enrichment}
            status={enrichmentStatus}
          />

          <FloodSection
            flood={enrichment?.floodRisk}
            loading={enrichmentStatus === "loading"}
          />

          <FireRiskSection
            fireRisk={enrichment?.fireRisk ?? parcel.fireRisk}
            loading={enrichmentStatus === "loading" && !parcel.fireRisk}
          />

          <TopographySection
            topo={enrichment?.topography}
            loading={enrichmentStatus === "loading"}
          />

          <SoilsSection
            soil={enrichment?.soil}
            loading={enrichmentStatus === "loading"}
          />

          <LaCountySection parcel={enrichment?.laCountyParcel} />

          <DetailSection title="CABN Recommendation">
            <div className="rounded-2xl bg-[#f7f6f2] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase text-[#6f7b73]">
                    CABN opportunity
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[#111817]">
                    {buildDecisionLabel(cabnCompatibility.canBuild)} ·{" "}
                    {cabnCompatibility.rating}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#56605a]">
                    {recommendedModel
                      ? `${recommendedModel.name} is the provisional best fit. ${recommendationReason}`
                      : "No CABN model should be recommended from the current data. Manual review recommended."}
                  </p>
                </div>
                <div className="shrink-0 rounded-2xl bg-[#203b2c] px-4 py-3 text-center text-white">
                  <div className="font-mono text-3xl font-semibold leading-none">
                    {cabnCompatibility.totalScore}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase">
                    CABN score
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-xl bg-white px-2 py-1 text-xs font-semibold text-[#203b2c]">
                  {confidenceLabel(cabnCompatibility.confidence)}
                </span>
                <span className="rounded-xl bg-white px-2 py-1 text-xs font-semibold text-[#56605a]">
                  Manual review recommended
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="text-xs font-semibold uppercase text-[#6f7b73]">
                Possible CABNs
              </div>
              <div className="flex flex-wrap gap-2">
                {cabnCompatibility.possibleModels.length ? (
                  cabnCompatibility.possibleModels.map((model) => (
                    <span
                      key={model.id}
                      className="rounded-xl bg-[#eef7f0] px-2 py-1 text-xs font-semibold text-[#203b2c]"
                    >
                      {model.name}
                    </span>
                  ))
                ) : (
                  <span className="rounded-xl bg-[#fff6f2] px-2 py-1 text-xs font-semibold text-[#8b3f35]">
                    No model cleared current rules
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[#edf0ec] bg-white p-3">
              <div className="text-xs font-semibold uppercase text-[#6f7b73]">
                Why this model fits
              </div>
              <p className="mt-2 text-sm leading-6 text-[#56605a]">
                {recommendedModel
                  ? recommendationReason
                  : "Current parcel data does not support a CABN model recommendation yet."}
              </p>
            </div>

            <div className="mt-3 rounded-2xl border border-[#edf0ec] bg-white p-3">
              <div className="text-xs font-semibold uppercase text-[#6f7b73]">
                Why other models may not fit
              </div>
              <p className="mt-2 text-sm leading-6 text-[#56605a]">
                {unavailableModels.length
                  ? `${unavailableModels
                      .map((model) => model.name)
                      .join(", ")} need more area, access, slope, utility, or zoning confirmation. ${modelConstraintReason}`
                  : `All current CABN models remain possible from available rules. ${modelConstraintReason}`}
              </p>
            </div>
          </DetailSection>

          <DetailSection title="Compatibility Breakdown">
            <div className="space-y-3">
              {cabnCategoryLabels.map((item) => {
                const category = cabnCompatibility.categoryScores[item.key];

                return (
                  <div
                    key={item.key}
                    className="rounded-2xl border border-[#edf0ec] bg-[#f7f6f2] p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[#111817]">
                        {item.label}
                      </div>
                      <div className="font-mono text-sm font-semibold text-[#203b2c]">
                        {category.earnedPoints}/{category.maxPoints}
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf0ec]">
                      <div
                        className="h-full rounded-full bg-[#2b6f83]"
                        style={{ width: `${category.score}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#66716a]">
                      {categoryTakeaway(category)}
                    </p>
                  </div>
                );
              })}
            </div>
          </DetailSection>

          <DetailSection title="Known Strengths">
            <div className="space-y-2">
              {knownStrengths.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-[#56605a]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#203b2c]" />
                  {item}
                </div>
              ))}
            </div>
          </DetailSection>

          <DetailSection title="Known Constraints">
            <div className="space-y-2">
              {knownConstraints.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-[#6f5a34]">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#8b6b2d]" />
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[#f7f6f2] p-3">
              <div className="text-xs font-semibold uppercase text-[#6f7b73]">
                Data unavailable
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {unknownData.map((item) => (
                  <span
                    key={item}
                    className="rounded-xl bg-white px-2 py-1 text-xs font-semibold text-[#66716a]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Estimated Complexity">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[#f7f6f2] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase text-[#6f7b73]">
                  Permitting
                </div>
                <div className="mt-1 text-sm font-semibold text-[#111817]">
                  {cabnCompatibility.permittingComplexity}
                </div>
              </div>
              <div className="rounded-2xl bg-[#f7f6f2] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase text-[#6f7b73]">
                  Site work
                </div>
                <div className="mt-1 text-sm font-semibold text-[#111817]">
                  {cabnCompatibility.siteComplexity}
                </div>
              </div>
              <div className="rounded-2xl bg-[#f7f6f2] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase text-[#6f7b73]">
                  Utility connection
                </div>
                <div className="mt-1 text-sm font-semibold text-[#111817]">
                  {utilityComplexity}
                </div>
              </div>
              <div className="rounded-2xl bg-[#f7f6f2] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase text-[#6f7b73]">
                  Delivery/install
                </div>
                <div className="mt-1 text-sm font-semibold text-[#111817]">
                  {deliveryComplexity}
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#66716a]">
              {confidenceLabel(cabnCompatibility.confidence)}. This is a rules-based
              pre-screen, not a permit decision.
            </p>
          </DetailSection>

          <DetailSection title="Recommended Next Steps">
            <div className="space-y-2">
              {cabnCompatibility.nextSteps.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-[#56605a]">
                  <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#203b2c]" />
                  {item}
                </div>
              ))}
            </div>
          </DetailSection>

        <DetailSection title="Utilities">
          <div className="grid gap-2 text-sm font-semibold text-[#27302b]">
            <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2">
              <span className="flex items-center gap-2">
                <Droplets className="h-4 w-4 text-[#2b6f83]" /> Water
              </span>
              <span>{utilityLabel(parcel.utilities.water)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#203b2c]" /> Electricity
              </span>
              <span>{utilityLabel(parcel.utilities.electricity)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[#f7f6f2] px-3 py-2">
              <span className="flex items-center gap-2">
                <Waves className="h-4 w-4 text-[#2b6f83]" /> Sewer/septic
              </span>
              <span>{utilityLabel(parcel.utilities.sewerSeptic)}</span>
            </div>
          </div>
        </DetailSection>

        <DetailSection title="Access">
          <div className="flex items-start gap-3 text-sm font-semibold text-[#27302b]">
            <Route className="mt-0.5 h-4 w-4 shrink-0 text-[#203b2c]" />
            <span>{parcel.roadAccess.label}</span>
          </div>
        </DetailSection>

        <DetailSection title="Estimated Site Work">
          <div className="grid gap-2">
            {parcel.estimatedSiteWork.map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-[#56605a]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#203b2c]" />
                {item}
              </div>
            ))}
          </div>
        </DetailSection>

        <DetailSection title="Potential Permit Difficulty">
          <div className="flex items-start gap-3 rounded-2xl bg-[#eef7f0] px-3 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#203b2c]" />
            <div>
              <div className="text-sm font-semibold text-[#203b2c]">
                {permitDifficulty(parcel)}
              </div>
              <div className="mt-1 text-sm leading-6 text-[#56605a]">
                {parcel.zoningSummary}
              </div>
            </div>
          </div>
        </DetailSection>

        <DetailSection title="Nearby Amenities">
          <div className="flex flex-wrap gap-2">
            {parcel.nearbyAmenities.map((amenity) => (
              <span
                key={amenity}
                className="rounded-xl bg-[#f7f6f2] px-2 py-1 text-xs font-semibold text-[#56605a]"
              >
                {amenity}
              </span>
            ))}
          </div>
        </DetailSection>

      </div>

      </div>

      <div className="grid gap-2 border-t border-[#edf0ec] bg-white/96 p-4">
        {matchOpen ? (
          <div className="rounded-[24px] border border-[#d9e5ea] bg-[#eef7f8] p-4">
            <div className="text-xs font-semibold uppercase text-[#55727d]">
              CABN model match
            </div>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#111817]">
                  {recommendedModel?.name ?? "Manual review needed"}
                </div>
                <p className="mt-1 text-xs leading-5 text-[#55727d]">
                  {recommendedModel
                    ? `${recommendedModel.sizeSqft} sq ft · ${cabnCompatibility.rating}`
                    : "No CABN model cleared the current rule checks"}
                </p>
              </div>
              <span className="rounded-xl bg-white px-2 py-1 font-mono text-xs font-semibold text-[#244f5f]">
                {cabnCompatibility.totalScore}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#3f5d67]">
              {recommendedModel
                ? recommendationReason
                : modelConstraintReason}
            </p>
            {cabnCompatibility.possibleModels.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {cabnCompatibility.possibleModels.slice(0, 4).map((model) => (
                  <span
                    key={model.id}
                    className="rounded-xl bg-white px-2 py-1 text-xs font-semibold text-[#244f5f]"
                  >
                    {model.name}
                  </span>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => onContact?.(parcel)}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-semibold text-[#244f5f] transition hover:-translate-y-0.5"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Ask Tony to review this CABN match
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleSelectLot}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#203b2c] px-4 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#2e523e]"
        >
          <MapPinned className="h-4 w-4" aria-hidden="true" />
          Select Lot
        </button>
        <button
          type="button"
          onClick={() => onContact?.(parcel)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#dfe6df] bg-white px-4 text-sm font-semibold text-[#203b2c] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#f7f6f2]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Ask Tony about this lot
        </button>
        <button
          type="button"
          onClick={() => setMatchOpen((open) => !open)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#d9e5ea] bg-[#eef7f8] px-4 text-sm font-semibold text-[#244f5f] transition duration-200 hover:-translate-y-0.5 hover:bg-[#e3f1f4]"
          aria-expanded={matchOpen}
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          {matchOpen ? "Hide CABN match" : "Match this lot with a CABN"}
        </button>
        <button
          type="button"
          onClick={() => onToggleSave(parcel.id)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#e5e9e4] bg-white px-4 text-sm font-semibold text-[#27302b] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f7f6f2]"
        >
          <Bookmark
            className={`h-4 w-4 ${
              saved ? "fill-[#263b2c] text-[#263b2c]" : ""
            }`}
            aria-hidden="true"
          />
          {saved
            ? saveMode === "local"
              ? "Saved locally"
              : "Saved property"
            : "Save property"}
        </button>
        {saveMessage ? (
          <p className="px-1 text-center text-xs font-medium text-[#66716a]">
            {saveMessage}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
