"use client";

import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  DollarSign,
  Droplets,
  LoaderCircle,
  MapPin,
  Power,
  RotateCcw,
  Route,
  Ruler,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Waves,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { defaultSearchFilters } from "@/lib/parcelSearch";
import { TINY_HOME_MODEL_SIZES } from "@/types/parcel";
import type { SearchFilters, UtilityKey } from "@/types/parcel";

type SearchFiltersProps = {
  filters: SearchFilters;
  resultCount: number;
  locationSearchStatus?: "idle" | "loading" | "ready" | "error";
  locationSearchMessage?: string;
  onChange: (filters: SearchFilters) => void;
  onLocationSearch?: (location: string) => void;
};

const utilityOptions: Array<{
  key: UtilityKey;
  label: string;
  Icon: LucideIcon;
}> = [
  { key: "water", label: "Water", Icon: Droplets },
  { key: "electricity", label: "Electricity", Icon: Zap },
  { key: "sewerSeptic", label: "Sewer/septic", Icon: Waves },
];

const permitOptions = [
  { value: "any", label: "Any" },
  { value: "medium", label: "Medium+" },
  { value: "high", label: "High" },
] as const;

export function SearchFilters({
  filters,
  resultCount,
  locationSearchStatus = "idle",
  locationSearchMessage,
  onChange,
  onLocationSearch,
}: SearchFiltersProps) {
  const [locationDraft, setLocationDraft] = useState(filters.location);

  const updateFilter = <Key extends keyof SearchFilters>(
    key: Key,
    value: SearchFilters[Key],
  ) => {
    onChange({ ...filters, [key]: value });
  };

  const updateUtility = (key: UtilityKey, value: boolean) => {
    onChange({
      ...filters,
      utilities: {
        ...filters.utilities,
        [key]: value,
      },
    });
  };

  const submitLocation = (event: FormEvent) => {
    event.preventDefault();
    onLocationSearch?.(locationDraft);
  };

  const resetFilters = () => {
    setLocationDraft(defaultSearchFilters.location);
    onChange(defaultSearchFilters);
  };

  return (
    <section className="rounded-[26px] bg-transparent">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#111817]">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
          </div>
          <p className="mt-1 text-xs font-medium text-[#6a746d]">
            {resultCount} ranked lots
          </p>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f7f6f2] text-[#4b5650] transition duration-200 hover:-translate-y-0.5 hover:bg-[#eef3f1]"
          aria-label="Reset filters"
          title="Reset filters"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4">
        <form onSubmit={submitLocation}>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[#242a26]">
            <MapPin className="h-4 w-4 text-[#2b6f83]" aria-hidden="true" />
            Location
            </span>
            <div className="flex gap-2">
              <input
                value={locationDraft}
                onChange={(event) => setLocationDraft(event.target.value)}
                className="h-12 min-w-0 flex-1 rounded-2xl border border-[#e5e9e4] bg-white px-4 text-[15px] text-[#111817] outline-none transition placeholder:text-[#9ba49d] focus:border-[#8fb9c9] focus:ring-4 focus:ring-[#b9d7e7]/35"
                placeholder="Austin, TX"
              />
              <button
                type="submit"
                disabled={locationSearchStatus === "loading"}
                className="inline-flex h-12 min-w-12 items-center justify-center rounded-2xl bg-[#203b2c] px-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#2e523e] disabled:opacity-60"
                aria-label="Search this location"
                title="Search this location"
              >
                {locationSearchStatus === "loading" ? (
                  <LoaderCircle
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </label>
          {locationSearchMessage ? (
            <p
              className={`mt-2 flex items-start gap-1.5 text-xs font-medium ${
                locationSearchStatus === "error"
                  ? "text-[#8b3f35]"
                  : "text-[#66716a]"
              }`}
            >
              {locationSearchStatus === "error" ? (
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
              ) : null}
              <span>{locationSearchMessage}</span>
            </p>
          ) : null}
        </form>

        <div>
          <label className="mb-1.5 flex items-center justify-between gap-3 text-sm font-semibold text-[#242a26]">
            <span className="flex items-center gap-2">
              <Route className="h-4 w-4 text-[#203b2c]" aria-hidden="true" />
              Radius
            </span>
            <span className="font-mono text-xs text-[#66716a]">
              {filters.radiusMiles} mi
            </span>
          </label>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={filters.radiusMiles}
            onChange={(event) =>
              updateFilter("radiusMiles", Number(event.target.value))
            }
            className="w-full accent-[#203b2c]"
          />
        </div>

        <label className="block">
          <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[#242a26]">
            <DollarSign
              className="h-4 w-4 text-[#203b2c]"
              aria-hidden="true"
            />
            Max price
          </span>
          <input
            type="number"
            min={25000}
            step={5000}
            value={filters.maxPrice}
            onChange={(event) =>
              updateFilter("maxPrice", Number(event.target.value))
            }
            className="h-12 w-full rounded-2xl border border-[#e5e9e4] bg-white px-4 text-[15px] text-[#111817] outline-none transition focus:border-[#8fb9c9] focus:ring-4 focus:ring-[#b9d7e7]/35"
          />
        </label>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#242a26]">
            <Ruler className="h-4 w-4 text-[#2b6f83]" aria-hidden="true" />
            CABN model
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TINY_HOME_MODEL_SIZES.map((size) => {
              const isActive = filters.modelSize === size;

              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => updateFilter("modelSize", size)}
                  className={`h-11 rounded-2xl border px-3 text-sm font-semibold transition duration-200 ${
                    isActive
                      ? "border-[#203b2c] bg-[#203b2c] text-white shadow-sm"
                      : "border-[#e5e9e4] bg-white text-[#27302b] hover:-translate-y-0.5 hover:bg-[#f7f6f2]"
                  }`}
                >
                  {size} sq ft
                </button>
              );
            })}
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#242a26]">
            <Power className="h-4 w-4 text-[#203b2c]" aria-hidden="true" />
            Utilities
          </legend>
          <div className="space-y-2">
            {utilityOptions.map(({ key, label, Icon }) => (
              <label
                key={key}
                className="flex min-h-12 items-center justify-between rounded-2xl border border-[#e5e9e4] bg-white px-4 text-sm font-semibold text-[#27302b] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f7f6f2]"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[#2b6f83]" aria-hidden="true" />
                  {label}
                </span>
                <input
                  type="checkbox"
                  checked={filters.utilities[key]}
                  onChange={(event) => updateUtility(key, event.target.checked)}
                  className="h-4 w-4 accent-[#203b2c]"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex min-h-12 items-center justify-between rounded-2xl border border-[#e5e9e4] bg-white px-4 text-sm font-semibold text-[#27302b] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f7f6f2]">
          <span className="flex items-center gap-2">
            <Route className="h-4 w-4 text-[#203b2c]" aria-hidden="true" />
            Road access
          </span>
          <input
            type="checkbox"
            checked={filters.requiresRoadAccess}
            onChange={(event) =>
              updateFilter("requiresRoadAccess", event.target.checked)
            }
            className="h-4 w-4 accent-[#203b2c]"
          />
        </label>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#242a26]">
            <ShieldCheck
              className="h-4 w-4 text-[#203b2c]"
              aria-hidden="true"
            />
            Permit friendliness
          </div>
          <div className="grid grid-cols-3 gap-2">
            {permitOptions.map((option) => {
              const isActive = filters.permitFriendliness === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    updateFilter("permitFriendliness", option.value)
                  }
                  className={`h-11 rounded-2xl border px-2 text-sm font-semibold transition duration-200 ${
                    isActive
                      ? "border-[#203b2c] bg-[#203b2c] text-white shadow-sm"
                      : "border-[#e5e9e4] bg-white text-[#27302b] hover:-translate-y-0.5 hover:bg-[#f7f6f2]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
