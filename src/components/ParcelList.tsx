"use client";

import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  Droplets,
  MapPin,
  Power,
  Ruler,
  Waves,
  Zap,
} from "lucide-react";
import { formatAcres, formatCurrency, formatMiles } from "@/lib/format";
import type {
  ParcelProviderStatus,
  ParcelSearchSource,
  ScoredParcel,
  SortOption,
} from "@/types/parcel";

type ParcelListProps = {
  parcels: ScoredParcel[];
  selectedParcelId?: string;
  sort: SortOption;
  loading: boolean;
  providerStatus: ParcelProviderStatus;
  providerMessage: string;
  source: ParcelSearchSource;
  onSortChange: (sort: SortOption) => void;
  onSelectParcel: (parcelId: string) => void;
  onHoverParcel: (parcelId?: string) => void;
};

const sortOptions: Array<{ value: SortOption; label: string }> = [
  { value: "bestMatch", label: "Best Match" },
  { value: "lowestPrice", label: "Lowest Price" },
  { value: "largestLot", label: "Largest Lot" },
  { value: "closest", label: "Closest" },
  { value: "highestScore", label: "Highest CABN Score" },
];

function sourceBadge(source: ParcelSearchSource) {
  if (source === "regrid") return "Source: Regrid";
  if (source === "la_county_gis") return "Source: LA County GIS";
  return "Source: Mock Data";
}

function utilityClass(enabled: boolean) {
  return enabled
    ? "bg-[#eef7f0] text-[#203b2c]"
    : "bg-[#f4f2ed] text-[#737c75]";
}

function ParcelCard({
  parcel,
  selected,
  onSelect,
  onHover,
}: {
  parcel: ScoredParcel;
  selected: boolean;
  onSelect: (parcelId: string) => void;
  onHover: (parcelId?: string) => void;
}) {
  const cabn = parcel.cabnCompatibility;
  const score = cabn?.totalScore ?? parcel.fitScore.total;
  const rating = cabn?.rating ?? "Possible";
  const recommendedModel = cabn?.recommendedModel?.name ?? "Manual review";
  const strengths =
    cabn && cabn.strengths.length
      ? cabn.strengths.slice(0, 2)
      : parcel.fitScore.considerations.slice(0, 2);
  const warnings = cabn
    ? [
        ...cabn.warnings,
        ...cabn.unknowns.map((item) => `Data unavailable: ${item}`),
      ].slice(0, 2)
    :
    [...parcel.constraints, ...parcel.fitScore.considerations].slice(0, 2);
  const confidence = cabn?.confidence ?? "Low";

  return (
    <button
      type="button"
      onClick={() => onSelect(parcel.id)}
      onMouseEnter={() => onHover(parcel.id)}
      onMouseLeave={() => onHover(undefined)}
      className={`grid min-h-[158px] grid-cols-[118px_minmax(0,1fr)] overflow-hidden rounded-[24px] border bg-white text-left shadow-[0_12px_34px_rgba(22,24,23,0.08)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(22,24,23,0.13)] ${
        selected
          ? "border-[#203b2c] ring-4 ring-[#b9d7e7]/45"
          : "border-[#eef0eb]"
      }`}
    >
      <div
        className="h-full min-h-[158px] bg-[#d7dfcf] bg-cover bg-center"
        style={{
          backgroundImage: parcel.previewImageUrl
            ? `url(${parcel.previewImageUrl})`
            : "linear-gradient(135deg, #d7dfcf, #b9caa9)",
        }}
      />
      <div className="min-w-0 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-[#111817]">
              {parcel.title}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs font-medium text-[#6a746d]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {parcel.city}, {parcel.state}
              </span>
            </div>
          </div>
          <div className="shrink-0 rounded-2xl bg-[#203b2c] px-3 py-2 text-center text-white shadow-sm">
            <div className="font-mono text-lg font-semibold leading-none">
              {score}
            </div>
            <div className="mt-1 text-[9px] font-semibold uppercase">
              CABN
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-xl bg-[#f7f6f2] px-2 py-1 text-xs font-semibold text-[#27302b]">
            {formatCurrency.format(parcel.price)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-xl bg-[#eef7f0] px-2 py-1 text-xs font-semibold text-[#203b2c]">
            <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
            {formatAcres(parcel.acreage)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-xl bg-[#eef7f8] px-2 py-1 text-xs font-semibold text-[#2b6f83]">
            {formatMiles(parcel.distanceMiles)}
          </span>
        </div>

        <div className="mt-3 rounded-2xl bg-[#f7f6f2] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold leading-5 text-[#203b2c]">
              {rating}
            </div>
            <div className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase text-[#6a746d]">
              {confidence} confidence
            </div>
          </div>
          <div className="mt-1 truncate text-xs font-semibold text-[#56605a]">
            {recommendedModel}
          </div>
        </div>

        <div className="mt-3 grid gap-1.5">
          {strengths.map((item) => (
            <div key={item} className="flex items-start gap-1.5 text-[11px] font-medium leading-4 text-[#3f5147]">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#203b2c]" />
              <span className="line-clamp-1">{item}</span>
            </div>
          ))}
          {warnings.map((item) => (
            <div key={item} className="flex items-start gap-1.5 text-[11px] font-medium leading-4 text-[#6f5a34]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8b6b2d]" />
              <span className="line-clamp-1">{item}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {cabn ? null : (
            <>
              <span
                className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-semibold ${utilityClass(
                  parcel.utilities.water,
                )}`}
              >
                <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                Water
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-semibold ${utilityClass(
                  parcel.utilities.electricity,
                )}`}
              >
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                Power
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-semibold ${utilityClass(
                  parcel.utilities.sewerSeptic,
                )}`}
              >
                <Waves className="h-3.5 w-3.5" aria-hidden="true" />
                Septic
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

export function ParcelList({
  parcels,
  selectedParcelId,
  sort,
  loading,
  providerStatus,
  providerMessage,
  source,
  onSortChange,
  onSelectParcel,
  onHoverParcel,
}: ParcelListProps) {
  const hasProviderWarning = providerStatus !== "ready";
  const isMockFallback = source === "mock" || source === "fallback";
  const statusBadge = isMockFallback
    ? "Mock Data Fallback"
    : providerStatus === "empty"
      ? "No Filter Matches"
      : hasProviderWarning
        ? "Provider Notice"
        : null;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-white/94">
      <div className="flex flex-col gap-3 border-b border-[#edf0ec] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#111817]">
            <Power className="h-4 w-4 text-[#203b2c]" aria-hidden="true" />
            {loading ? "Updating results" : `${parcels.length} matching lots`}
            {statusBadge ? (
              <span className="rounded-full bg-[#fff6df] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#8b6b2d]">
                {statusBadge}
              </span>
            ) : null}
            <span className="rounded-full bg-[#eef7f8] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#2b6f83]">
              {sourceBadge(source)}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[#6a746d]">
            {hasProviderWarning ? (
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0 text-[#8b6b2d]"
                aria-hidden="true"
              />
            ) : null}
            <span className="line-clamp-1">{providerMessage}</span>
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#27302b]">
          <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortOption)}
            className="h-11 rounded-2xl border border-[#e5e9e4] bg-[#f7f6f2] px-3 text-sm font-semibold text-[#111817] outline-none focus:border-[#8fb9c9] focus:ring-4 focus:ring-[#b9d7e7]/35"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="px-4 pt-3">
          <div className="h-2 overflow-hidden rounded-full bg-[#eef0eb]">
            <div className="soft-pulse h-full w-1/2 rounded-full bg-[#b9d7e7]" />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 overflow-y-auto p-3 premium-scrollbar">
        {parcels.length > 0 ? (
          parcels.map((parcel) => (
            <ParcelCard
              key={parcel.id}
              parcel={parcel}
              selected={parcel.id === selectedParcelId}
              onSelect={onSelectParcel}
              onHover={onHoverParcel}
            />
          ))
        ) : (
          <div className="rounded-[24px] border border-dashed border-[#d7ddd8] bg-[#f7f6f2] px-4 py-8 text-center shadow-[0_8px_24px_rgba(22,24,23,0.04)]">
            <MapPin
              className="mx-auto mb-3 h-6 w-6 text-[#789186]"
              aria-hidden="true"
            />
            <div className="text-sm font-semibold text-[#111817]">
              No matching parcels yet
            </div>
            <p className="mt-2 text-sm text-[#6a746d]">
              Broaden the radius, price, utilities, or permit filters. Tonyville
              will keep the mock fallback active while live parcel coverage grows.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
