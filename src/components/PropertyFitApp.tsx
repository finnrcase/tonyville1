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
  ArrowLeft,
  LoaderCircle,
  Mail,
  MapPin,
  MapPinned,
  RotateCw,
  Search,
} from "lucide-react";
import Link from "next/link";
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

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-[#111817]">
      <div className="grid min-h-screen lg:grid-cols-[430px_minmax(0,1fr)]">
        <aside className="z-10 flex flex-col gap-4 border-r border-[#e8ebe6] bg-white/94 p-5 shadow-[18px_0_55px_rgba(22,24,23,0.08)]">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#f7f6f2] px-3 text-sm font-semibold text-[#27302b]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Start
            </Link>
            <span className="rounded-full bg-[#eef7f8] px-3 py-1 text-xs font-semibold uppercase text-[#2b6f83]">
              Property fit
            </span>
          </div>

          <div>
            <h1 className="text-3xl font-semibold">
              Place a CABN on your property
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#66716a]">
              Early screening only. Drag the CABN footprint, rotate it, and
              review what data still needs manual confirmation.
            </p>
          </div>

          <form onSubmit={loadProperty} className="rounded-[26px] bg-[#f7f6f2] p-3">
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-[#2b6f83]" aria-hidden="true" />
              Address
            </label>
            <div className="flex gap-2">
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="100 W 1st St, Los Angeles, CA"
                className="h-12 min-w-0 flex-1 rounded-2xl border border-[#e5e9e4] bg-white px-4 text-sm outline-none focus:border-[#8fb9c9] focus:ring-4 focus:ring-[#b9d7e7]/35"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#203b2c] text-white disabled:opacity-60"
                aria-label="Search property"
              >
                {loading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-2 text-xs font-medium leading-5 text-[#66716a]">
              {message}
            </p>
          </form>

          <div className="rounded-[26px] bg-[#f7f6f2] p-3">
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
                        ? "border-[#203b2c] bg-[#203b2c] text-white"
                        : "border-[#e5e9e4] bg-white text-[#27302b]"
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

          <section className="rounded-[28px] border border-[#ebe6dc] bg-[#fbf7ed] p-5 shadow-[0_16px_45px_rgba(22,24,23,0.055)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#203b2c]">
                  Usable Yard Area
                </h2>
                {usableYardEstimate.unavailable ? (
                  <div className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-[#1c1e1b]">
                    Usable yard estimate unavailable
                  </div>
                ) : (
                  <div className="mt-4">
                    {usableYardEstimate.preliminary ? (
                      <div className="mb-2 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#66716a]">
                        Preliminary estimate
                      </div>
                    ) : null}
                    <div className="text-sm font-medium text-[#66716a]">
                      Estimated usable yard
                    </div>
                    <div className="mt-1 font-mono text-4xl font-semibold tracking-[-0.04em] text-[#203b2c]">
                      {usableYardEstimate.sqft?.toLocaleString()} sq ft
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-[#56625c]">
              {usableYardEstimate.unavailable
                ? "Add or confirm structures to improve the estimate."
                : usableYardEstimate.preliminary
                  ? "Based on lot area only. Add or confirm structures to improve the estimate."
                  : "Based on the selected property boundary, existing structures, and required clearance. Final placement must be verified during the Project Confirmation Visit."}
            </p>

            {parcelResponse ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMarkMode((active) => !active)}
                  className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-3 text-sm font-semibold transition ${
                    markMode
                      ? "bg-[#203b2c] text-white"
                      : "bg-white text-[#27302b]"
                  }`}
                >
                  {markMode ? "Click map to add structure" : "Mark structure"}
                </button>
                <button
                  type="button"
                  onClick={() => setStructuresConfirmed(true)}
                  className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-3 text-sm font-semibold transition ${
                    structuresConfirmed
                      ? "bg-[#eef7f0] text-[#203b2c]"
                      : "bg-white text-[#27302b]"
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
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-white px-3 text-sm font-semibold text-[#56625c] transition sm:col-span-2"
                  >
                    Clear {structures.length} marked structure
                    {structures.length === 1 ? "" : "s"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="rounded-[26px] bg-[#f7f6f2] p-3">
            <label className="flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2">
                <RotateCw className="h-4 w-4 text-[#203b2c]" aria-hidden="true" />
                Rotation
              </span>
              <span className="font-mono">{Math.round(placement.rotationDeg)}°</span>
            </label>
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
              className="mt-3 w-full accent-[#203b2c]"
              aria-label="Rotate CABN footprint"
            />
          </div>

          {parcelResponse ? (
            <div className="rounded-[26px] border border-[#e7ebe6] bg-white p-4">
              <div className="mb-2 text-xs font-semibold uppercase text-[#66716a]">
                {sourceLabel(parcelResponse.source)}
              </div>
              <div className="font-semibold">{parcelResponse.parcel.title}</div>
              <div className="mt-1 text-sm text-[#66716a]">
                {formatAcres(parcelResponse.parcel.acreage)} · {parcelResponse.parcel.address}
              </div>
              {!parcelResponse.existingStructuresAvailable ? (
                <p className="mt-3 flex gap-2 rounded-2xl bg-[#fff6df] p-3 text-sm leading-5 text-[#715520]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Existing structures unavailable — manual review needed.
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            disabled={!parcelResponse}
            onClick={handleSelectProperty}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#203b2c] px-4 py-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#2e523e] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <MapPinned className="h-4 w-4" aria-hidden="true" />
            {parcelResponse ? "Select Lot" : "Search an address to select lot"}
          </button>

          <a
            href={buildPlacementMailto({
              address: address || "Address not searched yet",
              model: selectedModel,
              result: placementResult,
            })}
            onClick={handlePlacementInquiry}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#203b2c] px-4 py-4 text-sm font-semibold text-white"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            Ask Tony about this placement
          </a>
        </aside>

        <section className="relative min-h-screen">
          {!mapboxToken ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#e8ebe6] p-6 text-center">
              <div className="max-w-sm rounded-3xl bg-white p-6 shadow-xl">
                <div className="text-lg font-semibold">Mapbox token missing</div>
                <p className="mt-2 text-sm leading-6 text-[#66716a]">
                  Add `NEXT_PUBLIC_MAPBOX_TOKEN` to use the placement map.
                </p>
              </div>
            </div>
          ) : null}
          <div ref={mapNode} className="absolute inset-0 h-full min-h-screen w-full" />
          <div className="pointer-events-none absolute bottom-5 left-5 rounded-full border border-white/70 bg-white/85 px-4 py-2 text-xs font-semibold text-[#58625c] shadow-[0_18px_55px_rgba(22,24,23,0.12)] backdrop-blur-2xl">
            Drag the CABN footprint · Early screening only
          </div>
        </section>
      </div>
    </main>
  );
}
