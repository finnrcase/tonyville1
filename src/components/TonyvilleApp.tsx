"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Filter,
  Home,
  Map,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { MapView } from "@/components/MapView";
import { ParcelDetailPanel } from "@/components/ParcelDetailPanel";
import { ParcelList } from "@/components/ParcelList";
import { SearchFilters } from "@/components/SearchFilters";
import { resolveSearchCenter, sortParcels } from "@/lib/parcelSearch";
import { useParcelEnrichment } from "@/lib/enrichmentClient";
import { createSearchParams } from "@/lib/searchState";
import { AuthMenu } from "@/components/AuthMenu";
import { SavedSearchesMenu } from "@/components/SavedSearchesMenu";
import { isSupabaseConfigured } from "@/lib/supabase/readiness";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  listSavedParcelIds,
  saveParcel,
  unsaveParcel,
} from "@/lib/data/savedParcels";
import { buildTonyMailto } from "@/lib/contactTony";
import type {
  MapSearchCenter,
  MapStyleMode,
  ParcelSearchResponse,
  ParcelSourceDiagnostics,
  ScoredParcel,
  SearchFilters as SearchFiltersType,
  SortOption,
} from "@/types/parcel";

type LocationSearchStatus = "idle" | "loading" | "ready" | "error";

type TonyvilleAppProps = {
  initialFilters: SearchFiltersType;
  initialSort: SortOption;
  initialMapStyle: MapStyleMode;
  initialMapSearchCenter?: MapSearchCenter;
  mapboxToken: string;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function initialDiagnostics(): ParcelSourceDiagnostics {
  return {
    currentSource: "Regrid",
    fallbackReason: "The first live parcel search has not completed yet.",
    steps: {
      locationSearch: { ran: false, succeeded: false, status: "not-run" },
      mapboxGeocode: { ran: false, succeeded: false, status: "not-run" },
      regridRequest: { ran: false, succeeded: false, status: "not-run" },
      regridResponse: { ran: false, succeeded: false, status: "not-run" },
      regridParser: { ran: false, succeeded: false, status: "not-run" },
      laCountyRequest: { ran: false, succeeded: false, status: "not-run" },
      laCountyParser: { ran: false, succeeded: false, status: "not-run" },
      mockFallback: {
        ran: false,
        succeeded: false,
        status: "disabled-no-fabricated-data",
      },
    },
  };
}

function initialSearchResponse(filters: SearchFiltersType): ParcelSearchResponse {
  // No fabricated parcels: the app starts empty and fills in with real
  // provider results from the first /api/parcels fetch.
  return {
    parcels: [],
    center: resolveSearchCenter(filters.location),
    source: "regrid",
    providerStatus: "empty",
    providerMessage: "Searching official parcel records…",
    diagnostics: initialDiagnostics(),
  };
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

const localSavedParcelKey = "tonyville:savedParcelIds";

function readLocalSavedParcelIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(localSavedParcelKey);
    const parsed = value ? (JSON.parse(value) as unknown) : [];

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeLocalSavedParcelIds(ids: Set<string>) {
  window.localStorage.setItem(
    localSavedParcelKey,
    JSON.stringify(Array.from(ids)),
  );
}

function DebugDataSourcePanel({
  diagnostics,
  providerMessage,
  locationSearchStatus,
  locationSearchMessage,
}: {
  diagnostics: ParcelSourceDiagnostics;
  providerMessage: string;
  locationSearchStatus: LocationSearchStatus;
  locationSearchMessage: string;
}) {
  const regrid = diagnostics.steps.regridResponse;
  const regridParser = diagnostics.steps.regridParser;
  const laCounty = diagnostics.steps.laCountyRequest;
  const laCountyParser = diagnostics.steps.laCountyParser;

  return (
    <details className="pointer-events-auto absolute bottom-20 left-4 z-30 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-white/70 bg-white/94 text-[#111817] shadow-[0_18px_55px_rgba(22,24,23,0.16)] backdrop-blur-2xl lg:left-auto lg:right-[468px]">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:hidden">
        Debug data source · {diagnostics.currentSource}
      </summary>
      <div className="grid gap-3 border-t border-[#edf0ec] px-4 py-4 text-xs font-medium text-[#5e6862]">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-[#f7f6f2] p-3">
            <div className="text-[10px] font-semibold uppercase text-[#747d77]">
              Current source
            </div>
            <div className="mt-1 font-mono text-sm font-semibold text-[#111817]">
              {diagnostics.currentSource}
            </div>
          </div>
          <div className="rounded-2xl bg-[#f7f6f2] p-3">
            <div className="text-[10px] font-semibold uppercase text-[#747d77]">
              Location search
            </div>
            <div className="mt-1 font-mono text-sm font-semibold text-[#111817]">
              {locationSearchStatus}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#f7f6f2] p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <span>Regrid status</span>
            <span className="font-mono text-[#111817]">{regrid.status}</span>
            <span>Regrid feature count</span>
            <span className="font-mono text-[#111817]">
              {regrid.featureCount ?? 0}
            </span>
            <span>Regrid parsed parcels</span>
            <span className="font-mono text-[#111817]">
              {regridParser.parsedParcelCount ?? 0}
            </span>
            <span>Regrid fallback triggered</span>
            <span className="font-mono text-[#111817]">
              {yesNo(Boolean(regrid.fallbackTriggered))}
            </span>
          </div>
        </div>

        <div className="rounded-2xl bg-[#f7f6f2] p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <span>LA County GIS status</span>
            <span className="font-mono text-[#111817]">{laCounty.status}</span>
            <span>LA County GIS feature count</span>
            <span className="font-mono text-[#111817]">
              {laCounty.featureCount ?? 0}
            </span>
            <span>LA County parsed parcels</span>
            <span className="font-mono text-[#111817]">
              {laCountyParser.parsedParcelCount ?? 0}
            </span>
            <span>LA County request ran</span>
            <span className="font-mono text-[#111817]">
              {yesNo(laCounty.ran)}
            </span>
          </div>
        </div>

        <div className="rounded-2xl bg-[#fff6df] p-3 text-[#715520]">
          <div className="text-[10px] font-semibold uppercase">
            Fallback reason
          </div>
          <p className="mt-1 leading-5">
            {diagnostics.fallbackReason ?? providerMessage}
          </p>
        </div>

        {locationSearchMessage ? (
          <p className="leading-5 text-[#66716a]">{locationSearchMessage}</p>
        ) : null}
      </div>
    </details>
  );
}

export function TonyvilleApp({
  initialFilters,
  initialSort,
  initialMapStyle,
  initialMapSearchCenter,
  mapboxToken,
}: TonyvilleAppProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [sort, setSort] = useState<SortOption>(initialSort);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>(initialMapStyle);
  const [mapSearchCenter, setMapSearchCenter] = useState<
    MapSearchCenter | undefined
  >(initialMapSearchCenter);
  const [searchResult, setSearchResult] = useState<ParcelSearchResponse>(() =>
    initialSearchResponse(initialFilters),
  );
  const [selectedParcelId, setSelectedParcelId] = useState<string>("");
  const [hoveredParcelId, setHoveredParcelId] = useState<string | undefined>();
  const [savedParcelIds, setSavedParcelIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Two-phase loading copy: quick responses are cache reads; slow ones are
  // usually a live official import happening on demand.
  const [loadingLabel, setLoadingLabel] = useState(
    "Checking official parcel records…",
  );
  const [locationSearchStatus, setLocationSearchStatus] =
    useState<LocationSearchStatus>("idle");
  const [locationSearchMessage, setLocationSearchMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const debouncedFilters = useDebouncedValue(filters, 350);
  const debouncedMapSearchCenter = useDebouncedValue(mapSearchCenter, 350);

  useEffect(() => {
    const params = createSearchParams({
      filters: debouncedFilters,
      sort,
      mapStyle,
      mapSearchCenter: debouncedMapSearchCenter,
    });
    const nextUrl = `${window.location.pathname}?${params.toString()}`;

    window.history.replaceState(null, "", nextUrl);
  }, [debouncedFilters, debouncedMapSearchCenter, mapStyle, sort]);

  useEffect(() => {
    const controller = new AbortController();
    const params = createSearchParams({
      filters: debouncedFilters,
      sort: "bestMatch",
      mapStyle: "streets",
      mapSearchCenter: debouncedMapSearchCenter,
    });

    const loadingTimeout = window.setTimeout(() => {
      setLoading(true);
      setLoadingLabel("Checking official parcel records…");
    }, 0);
    const importingLabelTimeout = window.setTimeout(() => {
      setLoadingLabel("Importing official parcel data…");
    }, 2500);

    fetch(`/api/parcels?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Parcel search failed");
        }

        return response.json() as Promise<ParcelSearchResponse>;
      })
      .then((data) => {
        setSearchResult(data);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        const fallback = initialSearchResponse(debouncedFilters);

        setSearchResult({
          ...fallback,
          providerStatus: "error",
          providerMessage:
            "Parcel search failed. No parcel data is shown for this search — try again.",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          window.clearTimeout(importingLabelTimeout);
          setLoading(false);
        }
      });

    return () => {
      window.clearTimeout(loadingTimeout);
      window.clearTimeout(importingLabelTimeout);
      controller.abort();
    };
  }, [debouncedFilters, debouncedMapSearchCenter]);

  const sortedParcels = useMemo(
    () => sortParcels(searchResult.parcels, sort),
    [searchResult.parcels, sort],
  );
  const selectedParcel =
    sortedParcels.find((parcel) => parcel.id === selectedParcelId) ??
    sortedParcels[0];
  const selectedId = selectedParcel?.id;
  const topScore = sortedParcels.reduce(
    (highest, parcel) =>
      Math.max(highest, parcel.cabnCompatibility?.totalScore ?? parcel.fitScore.total),
    0,
  );

  const { status: enrichmentStatus, data: enrichment } =
    useParcelEnrichment(selectedParcel);

  const handleFiltersChange = useCallback(
    (nextFilters: SearchFiltersType) => {
      if (nextFilters.location !== filters.location) {
        setMapSearchCenter(undefined);
      }

      setFilters(nextFilters);
    },
    [filters.location],
  );

  const handleMapSearchAreaChange = useCallback((center: MapSearchCenter) => {
    setLocationSearchStatus("idle");
    setLocationSearchMessage("");
    setMapSearchCenter(center);
  }, []);

  const handleSelectParcel = useCallback((parcelId: string) => {
    setSelectedParcelId(parcelId);
    setDetailOpen(true);
    setSaveMessage("");
  }, []);

  const handleLocationSearch = useCallback(async (location: string) => {
    const query = location.trim();

    if (!query) {
      setLocationSearchStatus("error");
      setLocationSearchMessage("Enter a city, address, or region.");
      return;
    }

    setLocationSearchStatus("loading");
    setLocationSearchMessage(`Searching for ${query}...`);

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = (await response.json()) as
        | {
            status: "ready";
            center: MapSearchCenter;
            message: string;
          }
        | {
            status: "missing-key" | "empty" | "error";
            message: string;
          };

      if (!response.ok || data.status !== "ready") {
        setLocationSearchStatus("error");
        setLocationSearchMessage(data.message);
        return;
      }

      setFilters((current) => ({
        ...current,
        location: data.center.label,
      }));
      setMapSearchCenter(data.center);
      setSelectedParcelId("");
      setDetailOpen(false);
      setLocationSearchStatus("ready");
      setLocationSearchMessage(data.message);
    } catch {
      setLocationSearchStatus("error");
      setLocationSearchMessage("Location search failed. Please try again.");
    }
  }, []);

  const handleAskTony = useCallback((parcel: ScoredParcel) => {
    window.location.href = buildTonyMailto(parcel, window.location.href);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const timeoutId = window.setTimeout(() => {
        setSavedParcelIds(new Set(readLocalSavedParcelIds()));
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    let active = true;
    listSavedParcelIds().then((ids) => {
      if (active) setSavedParcelIds(new Set(ids));
    });
    const supabase = createSupabaseBrowserClient();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      listSavedParcelIds().then((ids) => {
        if (active) setSavedParcelIds(new Set(ids));
      });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const toggleSaved = (parcelId: string) => {
    const parcel = sortedParcels.find((item) => item.id === parcelId);
    const isSaved = savedParcelIds.has(parcelId);

    if (!isSupabaseConfigured()) {
      setSavedParcelIds((current) => {
        const next = new Set(current);
        if (isSaved) next.delete(parcelId);
        else next.add(parcelId);
        writeLocalSavedParcelIds(next);
        return next;
      });
      setSaveMessage(
        isSaved
          ? "Removed from local saved properties."
          : "Saved locally on this device. Sign in later to sync across devices.",
      );
      return;
    }

    setSavedParcelIds((current) => {
      const next = new Set(current);
      if (isSaved) next.delete(parcelId);
      else next.add(parcelId);
      return next;
    });

    const op = isSaved
      ? unsaveParcel(parcelId)
      : parcel
        ? saveParcel(parcel)
        : Promise.resolve(false);

    op.then((ok) => {
      if (ok) {
        if (!isSaved) {
          const local = new Set(readLocalSavedParcelIds());
          local.delete(parcelId);
          writeLocalSavedParcelIds(local);
        }
        setSaveMessage(
          isSaved
            ? "Removed from saved properties."
            : "Saved to your Tonyville account.",
        );
        return;
      }
      if (!isSaved) {
        setSavedParcelIds((current) => {
          const next = new Set(current);
          next.add(parcelId);
          writeLocalSavedParcelIds(next);
          return next;
        });
        setSaveMessage(
          "Saved locally on this device because Supabase auth or tables are not ready.",
        );
        return;
      }

      setSavedParcelIds((current) => {
        const next = new Set(current);
        next.delete(parcelId);
        writeLocalSavedParcelIds(next);
        return next;
      });
      setSaveMessage(
        "Removed from local saved properties. Supabase removal was not available.",
      );
    });
  };

  const activeCenter = debouncedMapSearchCenter ?? searchResult.center;
  const sourceLabel =
    searchResult.source === "regrid"
      ? "Source: Regrid"
      : searchResult.source === "la_county_gis"
        ? "Source: LA County GIS"
        : "Source: Mock Data";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f6f2] text-[#161817]">
      <MapView
        className="absolute inset-0 h-full min-h-screen"
        mapboxToken={mapboxToken}
        parcels={sortedParcels}
        center={activeCenter}
        selectedParcelId={selectedId}
        hoveredParcelId={hoveredParcelId}
        mapStyle={mapStyle}
        loading={loading}
        onMapStyleChange={setMapStyle}
        onSelectParcel={handleSelectParcel}
        onHoverParcel={setHoveredParcelId}
        onSearchAreaChange={handleMapSearchAreaChange}
      />

      <header className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-3xl border border-white/70 bg-white/88 px-4 py-3 shadow-[0_18px_55px_rgba(22,24,23,0.14)] backdrop-blur-2xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#203b2c] text-white shadow-sm">
            <Home className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-6 text-[#111817]">
              Tonyville
            </h1>
            <p className="mt-1 hidden text-sm font-medium text-[#5c655f] sm:block">
              Premium land intelligence for tiny-home buyers
            </p>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <div className="hidden gap-2 rounded-3xl border border-white/70 bg-white/88 p-2 shadow-[0_18px_55px_rgba(22,24,23,0.14)] backdrop-blur-2xl sm:grid sm:grid-cols-3">
            <div className="min-w-24 rounded-2xl bg-[#f7f6f2] px-4 py-2">
              <div className="text-[11px] font-semibold uppercase text-[#747d77]">
                Matches
              </div>
              <div className="font-mono text-xl font-semibold text-[#111817]">
                {sortedParcels.length}
              </div>
            </div>
            <div className="min-w-24 rounded-2xl bg-[#f7f6f2] px-4 py-2">
              <div className="text-[11px] font-semibold uppercase text-[#747d77]">
                Top CABN
              </div>
              <div className="font-mono text-xl font-semibold text-[#203b2c]">
                {topScore || "--"}
              </div>
            </div>
            <div className="min-w-24 rounded-2xl bg-[#f7f6f2] px-4 py-2">
              <div className="text-[11px] font-semibold uppercase text-[#747d77]">
                Saved
              </div>
              <div className="font-mono text-xl font-semibold text-[#111817]">
                {savedParcelIds.size}
              </div>
            </div>
          </div>
          <AuthMenu />
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-4 text-sm font-semibold text-[#27302b] shadow-[0_18px_55px_rgba(22,24,23,0.14)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white md:hidden"
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filters
          </button>
        </div>
      </header>

      <aside
        className={`pointer-events-auto absolute left-4 z-20 hidden w-[410px] flex-col gap-3 transition-all duration-300 md:flex ${
          filtersCollapsed
            ? "top-[92px] max-h-14"
            : "bottom-4 top-[92px]"
        }`}
      >
        <div className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-[0_22px_70px_rgba(22,24,23,0.15)] backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef7f8] text-[#2b6f83]">
              <Search className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[#111817]">
                {activeCenter.label}
              </div>
              <p className="truncate text-xs font-medium text-[#66716a]">
                {filters.radiusMiles} mi radius · max ${filters.maxPrice.toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiltersCollapsed((value) => !value)}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#f7f6f2] px-3 text-sm font-semibold text-[#27302b] transition hover:bg-[#eef3f1]"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              {filtersCollapsed ? "Open" : "Hide"}
            </button>
          </div>
        </div>

        {!filtersCollapsed ? (
          <>
            <div className="max-h-[60vh] overflow-y-auto premium-scrollbar rounded-3xl border border-white/70 bg-white/88 p-3 shadow-[0_22px_70px_rgba(22,24,23,0.15)] backdrop-blur-2xl">
              <SearchFilters
                key={`desktop-${filters.location}`}
                filters={filters}
                resultCount={sortedParcels.length}
                locationSearchStatus={locationSearchStatus}
                locationSearchMessage={locationSearchMessage}
                onChange={handleFiltersChange}
                onLocationSearch={handleLocationSearch}
              />
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/88 p-3 shadow-[0_22px_70px_rgba(22,24,23,0.15)] backdrop-blur-2xl">
              <SavedSearchesMenu filters={filters} onApply={handleFiltersChange} />
            </div>
            <ParcelList
              parcels={sortedParcels}
              selectedParcelId={selectedId}
              sort={sort}
              loading={loading}
              loadingLabel={loadingLabel}
              providerStatus={searchResult.providerStatus}
              providerMessage={searchResult.providerMessage}
              source={searchResult.source}
              onSortChange={setSort}
              onSelectParcel={handleSelectParcel}
              onHoverParcel={setHoveredParcelId}
            />
          </>
        ) : null}
      </aside>

      <section className="pointer-events-auto absolute bottom-4 left-4 right-4 z-20 md:hidden">
        <div className="mb-3 flex items-center justify-between rounded-3xl border border-white/70 bg-white/90 px-4 py-3 shadow-[0_18px_55px_rgba(22,24,23,0.14)] backdrop-blur-2xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#111817]">
              <Map className="h-4 w-4 text-[#2b6f83]" aria-hidden="true" />
              {sortedParcels.length} matches
            </div>
            <p className="truncate text-xs font-medium text-[#66716a]">
              {activeCenter.label} · {sourceLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#203b2c] px-3 text-sm font-semibold text-white"
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Refine
          </button>
        </div>
        <div className="max-h-[42vh] overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_22px_70px_rgba(22,24,23,0.18)] backdrop-blur-2xl">
          <ParcelList
            parcels={sortedParcels}
            selectedParcelId={selectedId}
            sort={sort}
            loading={loading}
            loadingLabel={loadingLabel}
              providerStatus={searchResult.providerStatus}
              providerMessage={searchResult.providerMessage}
              source={searchResult.source}
              onSortChange={setSort}
            onSelectParcel={handleSelectParcel}
            onHoverParcel={setHoveredParcelId}
          />
        </div>
      </section>

      <aside
        className={`pointer-events-auto fixed bottom-4 right-4 top-4 z-30 w-[min(430px,calc(100vw-2rem))] transition-transform duration-300 ease-out lg:top-[92px] ${
          detailOpen
            ? "translate-x-0"
            : "translate-x-[calc(100%+2rem)] lg:translate-x-0"
        }`}
      >
        <div className="mb-3 flex justify-end lg:hidden">
          <button
            type="button"
            onClick={() => setDetailOpen(false)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white/92 text-[#27302b] shadow-[0_18px_55px_rgba(22,24,23,0.14)] backdrop-blur-2xl"
            aria-label="Close property details"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <ParcelDetailPanel
          parcel={selectedParcel}
          saved={selectedParcel ? savedParcelIds.has(selectedParcel.id) : false}
          saveMode={isSupabaseConfigured() ? "supabase" : "local"}
          saveMessage={saveMessage}
          onToggleSave={toggleSaved}
          enrichment={enrichment}
          enrichmentStatus={enrichmentStatus}
          onContact={handleAskTony}
        />
      </aside>

      <DebugDataSourcePanel
        diagnostics={searchResult.diagnostics}
        providerMessage={searchResult.providerMessage}
        locationSearchStatus={locationSearchStatus}
        locationSearchMessage={locationSearchMessage}
      />

      <div className="pointer-events-none absolute bottom-5 right-5 z-10 hidden rounded-full border border-white/70 bg-white/80 px-4 py-2 text-xs font-semibold text-[#58625c] shadow-[0_18px_55px_rgba(22,24,23,0.12)] backdrop-blur-2xl lg:flex lg:right-[468px]">
        {searchResult.providerStatus === "ready" ? (
          <Sparkles className="mr-2 h-4 w-4 text-[#2b6f83]" aria-hidden="true" />
        ) : (
          <AlertTriangle
            className="mr-2 h-4 w-4 text-[#8b6b2d]"
            aria-hidden="true"
          />
        )}
        {sourceLabel}
      </div>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 bg-[#111817]/35 p-3 backdrop-blur-sm md:hidden">
          <div className="ml-auto flex h-full max-w-md translate-x-0 flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/95 shadow-2xl transition-transform">
            <div className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-4">
              <div className="text-sm font-semibold text-[#111817]">
                Refine search
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f7f6f2] text-[#27302b]"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 premium-scrollbar">
              <SearchFilters
                key={`mobile-${filters.location}`}
                filters={filters}
                resultCount={sortedParcels.length}
                locationSearchStatus={locationSearchStatus}
                locationSearchMessage={locationSearchMessage}
                onChange={handleFiltersChange}
                onLocationSearch={handleLocationSearch}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
