"use client";

import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type mapboxgl from "mapbox-gl";
import {
  AlertTriangle,
  LoaderCircle,
  Mail,
  RotateCw,
  Search,
} from "lucide-react";
import { SceneShell } from "@/components/flow/SceneShell";
import { buttonClass } from "@/components/ui/Button";
import { flowStepNumber } from "@/lib/flowSteps";
import { cabnModels, getCabnModel, type CABNModel } from "@/lib/cabnModels";
import { formatAcres } from "@/lib/format";
import {
  createSelectedRoomPlan,
  parcelToSelectedLot,
  writeSelectedRoomPlan,
  type StructureFootprint,
} from "@/lib/placeRoom";
import { yardFitScore, type YardFitResult } from "@/lib/scoring/yardFitScore";
import {
  cabnRectanglePolygon,
  centroidOfGeometry,
  feetToLat,
  feetToLng,
  usableYardAreaSqft,
  type CABNPlacement,
  type YardGeometry,
} from "@/lib/yardGeometry";
import type { Parcel, ParcelSearchSource } from "@/types/parcel";

type PropertyFitAppProps = {
  mapboxToken: string;
  initialModelId: string;
};

type PropertyFitResponse = {
  parcel: Parcel;
  source: ParcelSearchSource;
  sourceMessage: string;
  existingStructures: YardGeometry[];
  existingStructuresAvailable: boolean;
  diagnostics: {
    regridStatus: string;
    regridFeatureCount: number;
    laCountyStatus: string;
    laCountyFeatureCount: number;
    fallbackReason?: string;
  };
};

type GeocodeResponse =
  | {
      status: "ready";
      center: { label: string; lat: number; lng: number; source: string };
      message: string;
    }
  | { status: "missing-key" | "empty" | "error"; message: string };

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number | boolean>;
    geometry: YardGeometry | { type: "Point"; coordinates: [number, number] };
  }>;
};

const mapboxStyle = "mapbox://styles/mapbox/satellite-streets-v12";

function sourceLabel(source?: ParcelSearchSource) {
  if (source === "regrid") return "Source: Regrid";
  if (source === "la_county_gis") return "Source: LA County GIS";
  if (source === "mock") return "Source: Mock Data";
  return "Source: Not loaded";
}

function upsertSource(map: mapboxgl.Map, id: string, data: FeatureCollection) {
  const source = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data as Parameters<mapboxgl.GeoJSONSource["setData"]>[0]);
    return;
  }
  map.addSource(id, {
    type: "geojson",
    data: data as mapboxgl.GeoJSONSourceSpecification["data"],
  });
}

function boundsForGeometry(geometry?: YardGeometry): [[number, number], [number, number]] | undefined {
  const ring =
    geometry?.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry?.coordinates[0]?.[0];
  const coordinates = Array.isArray(ring)
    ? ring.filter(
        (point): point is [number, number] =>
          Array.isArray(point) &&
          typeof point[0] === "number" &&
          typeof point[1] === "number",
      )
    : [];
  if (!coordinates.length) return undefined;
  const lngs = coordinates.map((point) => point[0]);
  const lats = coordinates.map((point) => point[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

// Default 30 x 40 ft structure footprint the user drops to mark an existing building.
function structureRectAt(lng: number, lat: number): YardGeometry {
  const halfLng = feetToLng(15, lat);
  const halfLat = feetToLat(20);
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - halfLng, lat - halfLat],
        [lng + halfLng, lat - halfLat],
        [lng + halfLng, lat + halfLat],
        [lng - halfLng, lat + halfLat],
        [lng - halfLng, lat - halfLat],
      ],
    ],
  };
}

function structureFootprintFromGeometry(
  geometry: YardGeometry,
  index: number,
): StructureFootprint | null {
  if (geometry.type !== "Polygon") return null;

  return {
    id: `owned-structure-${index}`,
    label: index === 0 ? "Existing House" : "Existing Structure",
    footprint: geometry,
    source: "estimated",
  };
}

function buildPlacementMailto(input: {
  address: string;
  model: CABNModel;
  result: YardFitResult;
  currentUrl?: string;
}) {
  const body = [
    "Hi Tony,",
    "",
    "I would like to review this CABN placement:",
    "",
    `Address: ${input.address}`,
    `Selected model: ${input.model.name} (${input.model.widthFt} x ${input.model.lengthFt} ft)`,
    `Early placement status: ${input.result.status}`,
    "",
    input.currentUrl ? `Tonyville link: ${input.currentUrl}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  return `mailto:tony@tonysmoller.com?subject=${encodeURIComponent(
    "Tonyville CABN placement review",
  )}&body=${encodeURIComponent(body)}`;
}

function lotAreaFromParcel(parcel?: Parcel | null) {
  const geometry = parcel?.geometry as YardGeometry | undefined;
  const geometryArea = usableYardAreaSqft(geometry, []);
  if (geometryArea !== undefined) return geometryArea;
  if (parcel?.acreage && Number.isFinite(parcel.acreage)) {
    return Math.round(parcel.acreage * 43560);
  }
  return undefined;
}

function estimateClearanceBufferSqft(input: {
  lotAreaSqft: number;
  model: CABNModel;
}) {
  const approximateSideFt = Math.sqrt(input.lotAreaSqft);
  const clearanceFt = Math.max(
    input.model.defaultSetbackFt,
    input.model.requiredClearanceFt,
  );
  const approximateBuffer = approximateSideFt * 4 * clearanceFt;

  return Math.round(Math.min(input.lotAreaSqft * 0.35, approximateBuffer));
}

function calculateUsableYardEstimate(input: {
  parcel?: Parcel | null;
  structures: YardGeometry[];
  structuresAvailable: boolean;
  model: CABNModel;
}) {
  const lotAreaSqft = lotAreaFromParcel(input.parcel);
  if (lotAreaSqft === undefined) {
    return {
      sqft: undefined,
      preliminary: true,
      unavailable: true,
    };
  }

  if (!input.structuresAvailable) {
    return {
      sqft: Math.round(lotAreaSqft),
      preliminary: true,
      unavailable: false,
    };
  }

  const structureFootprintSqft = input.structures.reduce(
    (sum, structure) => sum + (usableYardAreaSqft(structure, []) ?? 0),
    0,
  );
  const clearanceBufferSqft = estimateClearanceBufferSqft({
    lotAreaSqft,
    model: input.model,
  });

  return {
    sqft: Math.max(
      0,
      Math.round(lotAreaSqft - structureFootprintSqft - clearanceBufferSqft),
    ),
    preliminary: false,
    unavailable: false,
  };
}

export function PropertyFitApp({
  mapboxToken,
  initialModelId,
}: PropertyFitAppProps) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const draggingRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("Enter an address to begin.");
  const [loading, setLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(initialModelId);
  const [parcelResponse, setParcelResponse] = useState<PropertyFitResponse | null>(null);
  const [placement, setPlacement] = useState<CABNPlacement>({
    center: { lng: -118.2437, lat: 34.0522 },
    rotationDeg: 0,
  });
  const [structures, setStructures] = useState<YardGeometry[]>([]);
  const [structuresConfirmed, setStructuresConfirmed] = useState(false);
  const [markMode, setMarkMode] = useState(false);

  const selectedModel = useMemo(
    () => getCabnModel(selectedModelId),
    [selectedModelId],
  );

  const structuresAvailable = structuresConfirmed || structures.length > 0;
  const parcelGeometry = parcelResponse?.parcel.geometry as YardGeometry | undefined;
  const placementResult = useMemo(
    () =>
      yardFitScore({
        parcelGeometry,
        existingStructures: structures,
        existingStructuresAvailable: structuresAvailable,
        placement,
        model: selectedModel,
        accessPathKnown: false,
        utilityTieInLikely: undefined,
      }),
    [
      parcelGeometry,
      structures,
      structuresAvailable,
      placement,
      selectedModel,
    ],
  );
  const usableYardEstimate = useMemo(
    () =>
      calculateUsableYardEstimate({
        parcel: parcelResponse?.parcel,
        structures,
        structuresAvailable,
        model: selectedModel,
      }),
    [parcelResponse?.parcel, selectedModel, structures, structuresAvailable],
  );

  const handlePlacementInquiry = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      window.location.href = buildPlacementMailto({
        address: address || "Address not searched yet",
        model: selectedModel,
        result: placementResult,
        currentUrl: window.location.href,
      });
    },
    [address, placementResult, selectedModel],
  );

  const handleSelectProperty = useCallback(() => {
    if (!parcelResponse) return;
    const backHref =
      typeof window === "undefined"
        ? "/property-fit"
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const structureFootprints = structures
      .map(structureFootprintFromGeometry)
      .filter((item): item is StructureFootprint => Boolean(item));
    const lot = parcelToSelectedLot(parcelResponse.parcel, {
      source: "owned_property",
      sourceMessage: parcelResponse.sourceMessage,
      backHref,
      structures: structureFootprints,
      structuresAvailable,
    });

    writeSelectedRoomPlan(
      createSelectedRoomPlan({
        lot,
        modelId: selectedModel.id,
      }),
    );
    window.location.assign("/place-room");
  }, [parcelResponse, selectedModel.id, structures, structuresAvailable]);

  useEffect(() => {
    let cancelled = false;
    async function loadMap() {
      if (!mapNode.current || mapRef.current || !mapboxToken) return;
      const mapboxglModule = (await import("mapbox-gl")).default;
      if (cancelled || !mapNode.current) return;
      mapboxglModule.accessToken = mapboxToken;
      const map = new mapboxglModule.Map({
        container: mapNode.current,
        style: mapboxStyle,
        center: [-118.2437, 34.0522],
        zoom: 17,
      });
      map.addControl(new mapboxglModule.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.resize();
        setMapReady(true);
      });
      window.setTimeout(() => map.resize(), 150);
      mapRef.current = map;
      if (process.env.NODE_ENV !== "production") {
        (
          window as unknown as {
            __tonyvillePropertyFitMap?: mapboxgl.Map;
          }
        ).__tonyvillePropertyFitMap = map;
      }
    }
    loadMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      if (process.env.NODE_ENV !== "production") {
        (
          window as unknown as {
            __tonyvillePropertyFitMap?: mapboxgl.Map;
          }
        ).__tonyvillePropertyFitMap = undefined;
      }
      mapRef.current = null;
    };
  }, [mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
    const parcelData: FeatureCollection = parcelGeometry
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { id: "parcel" },
              geometry: parcelGeometry,
            },
          ],
        }
      : empty;
    const cabnData: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            status: placementResult.status,
            valid: placementResult.validPlacement,
          },
          geometry: cabnRectanglePolygon(selectedModel, placement),
        },
      ],
    };
    const cabnHandleData: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            status: placementResult.status,
          },
          geometry: {
            type: "Point",
            coordinates: [placement.center.lng, placement.center.lat],
          },
        },
      ],
    };
    const structureData: FeatureCollection = {
      type: "FeatureCollection",
      features: structures.map((geometry, index) => ({
        type: "Feature",
        properties: { id: `structure-${index}` },
        geometry,
      })),
    };

    upsertSource(map, "yard-parcel", parcelData);
    upsertSource(map, "yard-cabn", cabnData);
    upsertSource(map, "yard-cabn-handle", cabnHandleData);
    upsertSource(map, "yard-structures", structureData);

    if (!map.getLayer("yard-parcel-fill")) {
      map.addLayer({
        id: "yard-parcel-fill",
        type: "fill",
        source: "yard-parcel",
        paint: { "fill-color": "#203b2c", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "yard-parcel-line",
        type: "line",
        source: "yard-parcel",
        paint: { "line-color": "#203b2c", "line-width": 3 },
      });
      map.addLayer({
        id: "yard-structure-fill",
        type: "fill",
        source: "yard-structures",
        paint: { "fill-color": "#27302b", "fill-opacity": 0.42 },
      });
      map.addLayer({
        id: "cabn-fill",
        type: "fill",
        source: "yard-cabn",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "valid"], false],
            "#c94f3d",
            "#f8fff9",
          ],
          "fill-opacity": 0.82,
        },
      });
      map.addLayer({
        id: "cabn-line",
        type: "line",
        source: "yard-cabn",
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "valid"], false],
            "#a83c2f",
            "#2e7350",
          ],
          "line-width": 3,
        },
      });
      map.addLayer({
        id: "cabn-handle",
        type: "circle",
        source: "yard-cabn-handle",
        paint: {
          "circle-color": "#203b2c",
          "circle-radius": 12,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });
    }
  }, [mapReady, parcelGeometry, structures, placement, placementResult, selectedModel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const onMouseDown = (event: mapboxgl.MapMouseEvent) => {
      event.preventDefault();
      draggingRef.current = true;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    };
    const onMouseMove = (event: mapboxgl.MapMouseEvent) => {
      if (!draggingRef.current) return;
      setPlacement((current) => ({
        ...current,
        center: { lng: event.lngLat.lng, lat: event.lngLat.lat },
      }));
    };
    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "grab";
    };
    const onLeave = () => {
      if (!draggingRef.current) map.getCanvas().style.cursor = "";
    };

    map.on("mousedown", "cabn-fill", onMouseDown);
    map.on("mousedown", "cabn-handle", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    map.on("mouseenter", "cabn-fill", onEnter);
    map.on("mouseenter", "cabn-handle", onEnter);
    map.on("mouseleave", "cabn-fill", onLeave);
    map.on("mouseleave", "cabn-handle", onLeave);

    return () => {
      map.off("mousedown", "cabn-fill", onMouseDown);
      map.off("mousedown", "cabn-handle", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      map.off("mouseenter", "cabn-fill", onEnter);
      map.off("mouseenter", "cabn-handle", onEnter);
      map.off("mouseleave", "cabn-fill", onLeave);
      map.off("mouseleave", "cabn-handle", onLeave);
    };
  }, [mapReady]);

  // Mark-structure mode: clicking the map drops a default building footprint.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !markMode) return;

    map.getCanvas().style.cursor = "crosshair";
    const onClick = (event: mapboxgl.MapMouseEvent) => {
      setStructures((current) => [
        ...current,
        structureRectAt(event.lngLat.lng, event.lngLat.lat),
      ]);
      setMarkMode(false);
    };
    map.on("click", onClick);

    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [mapReady, markMode]);

  const loadProperty = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const query = address.trim();
      if (!query) {
        setMessage("Enter an address before searching.");
        return;
      }

      setLoading(true);
      setMessage(`Searching for ${query}...`);

      try {
        const geocodeResponse = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const geocode = (await geocodeResponse.json()) as GeocodeResponse;
        if (!geocodeResponse.ok || geocode.status !== "ready") {
          setMessage(geocode.message);
          return;
        }

        const propertyResponse = await fetch(
          `/api/property-fit?lat=${geocode.center.lat}&lng=${geocode.center.lng}&address=${encodeURIComponent(geocode.center.label)}`,
        );
        const property = (await propertyResponse.json()) as PropertyFitResponse & {
          error?: string;
        };
        if (!propertyResponse.ok) {
          setMessage(property.error ?? "Property parcel lookup failed.");
          return;
        }

        setAddress(geocode.center.label);
        setParcelResponse(property);
        const center = centroidOfGeometry(
          property.parcel.geometry as YardGeometry | undefined,
          { lat: geocode.center.lat, lng: geocode.center.lng },
        );
        setPlacement({ center, rotationDeg: 0 });
        setStructures(property.existingStructures ?? []);
        setStructuresConfirmed(property.existingStructuresAvailable);
        setMarkMode(false);
        setMessage(property.sourceMessage);

        const map = mapRef.current;
        if (map) {
          const bounds = boundsForGeometry(property.parcel.geometry as YardGeometry | undefined);
          if (bounds) {
            map.fitBounds(bounds, { padding: 80, maxZoom: 19, duration: 900 });
          } else {
            map.flyTo({ center: [geocode.center.lng, geocode.center.lat], zoom: 18 });
          }
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Property search failed.");
      } finally {
        setLoading(false);
      }
    },
    [address],
  );

  const phase: "enter" | "confirm" = parcelResponse ? "confirm" : "enter";

  const mapVisual = (
    <div className="relative h-full w-full">
      {!mapboxToken ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-sunken p-6 text-center">
          <div className="max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <div className="text-lg font-semibold">Map unavailable</div>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Add `NEXT_PUBLIC_MAPBOX_TOKEN` to see your property.
            </p>
          </div>
        </div>
      ) : null}
      <div ref={mapNode} className="absolute inset-0 h-full w-full" />
      {phase === "confirm" ? (
        <div className="pointer-events-none absolute bottom-5 left-5 rounded-full border border-white/70 bg-white/85 px-4 py-2 text-xs font-semibold text-[#58625c] shadow-[0_18px_55px_rgba(22,24,23,0.12)] backdrop-blur-2xl">
          Drag the CABN footprint
        </div>
      ) : null}
    </div>
  );

  if (phase === "enter") {
    return (
      <SceneShell
        step={flowStepNumber("address")}
        title="Enter your address"
        helper="We’ll find your property in official records."
        visual={mapVisual}
        backHref="/"
      >
        <form onSubmit={loadProperty} className="grid gap-3">
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="100 W 1st St, Los Angeles, CA"
            aria-label="Property address"
            className="h-14 w-full rounded-[22px] border border-hairline bg-white px-5 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
          <button
            type="submit"
            disabled={loading}
            className={buttonClass("primary", "lg", "w-full")}
          >
            {loading ? (
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-5 w-5" aria-hidden="true" />
            )}
            {loading ? "Searching…" : "Find my property"}
          </button>
          <p className="text-sm leading-6 text-ink-soft">{message}</p>
        </form>
      </SceneShell>
    );
  }

  return (
    <SceneShell
      step={flowStepNumber("property")}
      title="Confirm property"
      helper={parcelResponse?.parcel.address ?? undefined}
      visual={mapVisual}
      onBack={() => {
        setParcelResponse(null);
        setMarkMode(false);
      }}
      continueLabel="Place CABN"
      onContinue={handleSelectProperty}
      secondary={
        <a
          href={buildPlacementMailto({
            address: address || "Address not searched yet",
            model: selectedModel,
            result: placementResult,
          })}
          onClick={handlePlacementInquiry}
          className="inline-flex items-center gap-1.5 font-semibold text-brand underline-offset-4 hover:underline"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Ask Tony about this placement
        </a>
      }
    >
      <div className="grid gap-2.5">
        <div className="rounded-[22px] border border-hairline bg-surface p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            {sourceLabel(parcelResponse?.source)}
          </div>
          <div className="mt-1 text-base font-semibold">
            {parcelResponse?.parcel.title}
          </div>
          <div className="mt-1 text-sm text-ink-soft">
            {parcelResponse ? formatAcres(parcelResponse.parcel.acreage) : null}
          </div>
        </div>

        <div className="rounded-[22px] border border-hairline bg-surface p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Usable yard
          </div>
          <div className="mt-1 text-2xl font-semibold text-brand">
            {usableYardEstimate.unavailable
              ? "Data unavailable"
              : `${usableYardEstimate.sqft?.toLocaleString()} sq ft`}
            {usableYardEstimate.preliminary && !usableYardEstimate.unavailable ? (
              <span className="ml-2 align-middle text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Preliminary
              </span>
            ) : null}
          </div>
        </div>

        {parcelResponse && !parcelResponse.existingStructuresAvailable ? (
          <p className="flex gap-2 rounded-[22px] bg-[#fff6df] p-4 text-sm leading-5 text-[#715520]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Existing structures unavailable — mark them below if needed.
          </p>
        ) : null}

        <details className="rounded-[22px] border border-hairline bg-surface">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ink">
            Adjust placement & model
          </summary>
          <div className="grid gap-4 border-t border-hairline px-5 py-4">
            <label className="grid gap-2 text-sm font-semibold">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <RotateCw className="h-4 w-4 text-brand" aria-hidden="true" />
                  Rotation
                </span>
                <span className="font-mono">{Math.round(placement.rotationDeg)}°</span>
              </span>
              <input
                type="range"
                min={0}
                max={359}
                value={placement.rotationDeg}
                onChange={(event) =>
                  setPlacement((current) => ({
                    ...current,
                    rotationDeg: Number(event.target.value),
                  }))
                }
                className="w-full accent-[#22402f]"
                aria-label="Rotate CABN footprint"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMarkMode((active) => !active)}
                className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-3 text-sm font-semibold transition ${
                  markMode ? "bg-brand text-white" : "bg-white text-ink"
                }`}
              >
                {markMode ? "Click map to add" : "Mark structure"}
              </button>
              <button
                type="button"
                onClick={() => setStructuresConfirmed(true)}
                className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-3 text-sm font-semibold transition ${
                  structuresConfirmed ? "bg-[#eef7f0] text-brand" : "bg-white text-ink"
                }`}
              >
                Confirm structures
              </button>
              {structures.length ? (
                <button
                  type="button"
                  onClick={() => {
                    setStructures([]);
                    setStructuresConfirmed(false);
                  }}
                  className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-2xl bg-white px-3 text-sm font-semibold text-ink-soft"
                >
                  Clear {structures.length} marked structure
                  {structures.length === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold">CABN model</div>
              <div className="grid grid-cols-2 gap-2">
                {cabnModels.map((model) => {
                  const active = model.id === selectedModel.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedModelId(model.id)}
                      className={`rounded-2xl border p-3 text-left text-sm font-semibold transition ${
                        active
                          ? "border-brand bg-brand text-white"
                          : "border-hairline bg-white text-ink"
                      }`}
                    >
                      {model.name}
                      <span className="mt-1 block text-xs opacity-75">
                        {model.widthFt} x {model.lengthFt} ft
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </details>
      </div>
    </SceneShell>
  );
}
