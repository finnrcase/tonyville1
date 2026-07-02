"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import type mapboxgl from "mapbox-gl";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Home,
  MapPinned,
  Move,
  RotateCw,
  Ruler,
  ShieldCheck,
} from "lucide-react";
import { cabnModels, getCabnModel } from "@/lib/cabnModels";
import { formatAcres } from "@/lib/format";
import {
  cabnPlacementToRoomPlacement,
  readSelectedRoomPlan,
  saveSelectedRoomPlacement,
  type SelectedRoomPlan,
  type StructureFootprint,
} from "@/lib/placeRoom";
import { yardFitScore, type YardFitResult } from "@/lib/scoring/yardFitScore";
import {
  cabnRectanglePolygon,
  centroidOfGeometry,
  feetToLat,
  feetToLng,
  type CABNPlacement,
  type YardGeometry,
} from "@/lib/yardGeometry";

type PlaceRoomAppProps = {
  mapboxToken: string;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number | boolean>;
    geometry: YardGeometry | { type: "Point"; coordinates: [number, number] };
  }>;
};

const mapboxStyle = "mapbox://styles/mapbox/satellite-streets-v12";

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

function boundsForGeometry(
  geometry?: YardGeometry,
): [[number, number], [number, number]] | undefined {
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

function fitTone(result: YardFitResult) {
  if (result.status === "Likely Fits") return "border-[#bcdac6] bg-[#eef7f0] text-[#203b2c]";
  if (result.status === "Does Not Fit") return "border-[#efc5bc] bg-[#fff0ed] text-[#8b3f35]";
  return "border-[#ead7a2] bg-[#fff6df] text-[#715520]";
}

function statusMessage(result: YardFitResult) {
  const blocker = result.blockers[0] ?? "";
  if (blocker.includes("outside the parcel boundary")) {
    return "Room is outside lot boundary";
  }
  if (blocker.includes("overlaps an existing structure")) {
    return "Room overlaps existing structure";
  }
  if (blocker.includes("within 5 ft")) {
    return "Room is too close to existing structure";
  }
  if (blocker.includes("setback")) {
    return "Setback violation";
  }
  if (result.validPlacement) {
    return result.unknowns.length
      ? "Placement is valid for early screening; manual verification needed"
      : "Placement is valid";
  }
  return "Move the room onto the lot to begin";
}

function listItems(items: string[], empty: string) {
  if (!items.length) return <li className="text-[#7a827c]">{empty}</li>;
  return items.map((item) => <li key={item}>{item}</li>);
}

function sourceLabel(plan: SelectedRoomPlan) {
  if (plan.lot.source === "owned_property") return "Owned property";
  if (plan.lot.provider === "regrid") return "Land parcel · Regrid";
  if (plan.lot.provider === "la_county_gis") return "Land parcel · LA County GIS";
  return "Land parcel";
}

export function PlaceRoomApp({ mapboxToken }: PlaceRoomAppProps) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const draggingRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [plan, setPlan] = useState<SelectedRoomPlan | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("cabn-160");
  const [placement, setPlacement] = useState<CABNPlacement>({
    center: { lng: -118.2437, lat: 34.0522 },
    rotationDeg: 0,
  });
  const [markMode, setMarkMode] = useState(false);
  const [extraStructures, setExtraStructures] = useState<StructureFootprint[]>([]);

  useEffect(() => {
    let active = true;
    window.setTimeout(() => {
      if (!active) return;
      const selectedPlan = readSelectedRoomPlan();
      setPlan(selectedPlan);
      if (!selectedPlan) return;

      setSelectedModelId(selectedPlan.modelId);
      const center = centroidOfGeometry(selectedPlan.lot.boundary, {
        lat: selectedPlan.lot.lat,
        lng: selectedPlan.lot.lng,
      });
      setPlacement({ center, rotationDeg: 0 });
      setExtraStructures([]);
    }, 0);

    return () => {
      active = false;
    };
  }, []);

  const selectedModel = useMemo(
    () => getCabnModel(selectedModelId),
    [selectedModelId],
  );
  const structures = useMemo(
    () => [...(plan?.lot.structures ?? []), ...extraStructures],
    [extraStructures, plan?.lot.structures],
  );
  const structureGeometries = useMemo(
    () => structures.map((structure) => structure.footprint),
    [structures],
  );
  const structuresAvailable = Boolean(plan?.lot.structuresAvailable);
  const placementResult = useMemo(
    () =>
      yardFitScore({
        parcelGeometry: plan?.lot.boundary,
        existingStructures: structureGeometries,
        existingStructuresAvailable: structuresAvailable,
        placement,
        model: selectedModel,
        accessPathKnown: false,
        utilityTieInLikely: undefined,
      }),
    [
      placement,
      plan?.lot.boundary,
      selectedModel,
      structureGeometries,
      structuresAvailable,
    ],
  );
  const backHref = plan?.lot.backHref ?? (plan?.lot.source === "owned_property" ? "/property-fit" : "/find-land");
  const roomDimensionLabel = `${selectedModel.widthFt}' x ${selectedModel.lengthFt}'`;

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
        zoom: 18,
      });
      map.addControl(new mapboxglModule.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.resize();
        setMapReady(true);
      });
      window.setTimeout(() => map.resize(), 150);
      mapRef.current = map;
    }

    loadMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !plan) return;

    const bounds = boundsForGeometry(plan.lot.boundary);
    if (bounds) {
      map.fitBounds(bounds, { padding: 90, maxZoom: 19, duration: 800 });
    } else {
      map.flyTo({ center: [plan.lot.lng, plan.lot.lat], zoom: 18 });
    }
  }, [mapReady, plan]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !plan) return;

    const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
    const roomPolygon = cabnRectanglePolygon(selectedModel, placement);
    const lotData: FeatureCollection = plan.lot.boundary
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                estimated: Boolean(plan.lot.boundaryIsEstimated),
              },
              geometry: plan.lot.boundary,
            },
          ],
        }
      : empty;
    const roomData: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            valid: placementResult.validPlacement,
            label: roomDimensionLabel,
          },
          geometry: roomPolygon,
        },
      ],
    };
    const roomLabelData: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            label: roomDimensionLabel,
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
      features: structures.map((structure) => ({
        type: "Feature",
        properties: { id: structure.id, label: structure.label },
        geometry: structure.footprint,
      })),
    };

    upsertSource(map, "place-lot", lotData);
    upsertSource(map, "place-room", roomData);
    upsertSource(map, "place-room-label", roomLabelData);
    upsertSource(map, "place-structures", structureData);

    if (!map.getLayer("place-lot-fill")) {
      map.addLayer({
        id: "place-lot-fill",
        type: "fill",
        source: "place-lot",
        paint: { "fill-color": "#203b2c", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "place-lot-line",
        type: "line",
        source: "place-lot",
        paint: {
          "line-color": "#203b2c",
          "line-width": 3,
          "line-dasharray": [
            "case",
            ["==", ["get", "estimated"], true],
            ["literal", [1.5, 1]],
            ["literal", [1, 0]],
          ],
        },
      });
      map.addLayer({
        id: "place-structure-fill",
        type: "fill",
        source: "place-structures",
        paint: { "fill-color": "#5b625c", "fill-opacity": 0.48 },
      });
      map.addLayer({
        id: "place-structure-line",
        type: "line",
        source: "place-structures",
        paint: { "line-color": "#2f3631", "line-width": 2 },
      });
      map.addLayer({
        id: "place-structure-label",
        type: "symbol",
        source: "place-structures",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#27302b",
          "text-halo-width": 1,
        },
      });
      map.addLayer({
        id: "place-room-fill",
        type: "fill",
        source: "place-room",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "valid"], false],
            "#f7d6d1",
            "#ffffff",
          ],
          "fill-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "place-room-line",
        type: "line",
        source: "place-room",
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "valid"], false],
            "#b94335",
            "#2e7350",
          ],
          "line-width": 4,
          "line-blur": 0.4,
        },
      });
      map.addLayer({
        id: "place-room-label-symbol",
        type: "symbol",
        source: "place-room-label",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 13,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#203b2c",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });
      map.addLayer({
        id: "place-room-handle",
        type: "circle",
        source: "place-room-label",
        paint: {
          "circle-color": "#203b2c",
          "circle-radius": 9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });
    }
  }, [
    mapReady,
    placement,
    placementResult.validPlacement,
    plan,
    roomDimensionLabel,
    selectedModel,
    structures,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !plan) return;

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

    map.on("mousedown", "place-room-fill", onMouseDown);
    map.on("mousedown", "place-room-handle", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    map.on("mouseenter", "place-room-fill", onEnter);
    map.on("mouseenter", "place-room-handle", onEnter);
    map.on("mouseleave", "place-room-fill", onLeave);
    map.on("mouseleave", "place-room-handle", onLeave);

    return () => {
      map.off("mousedown", "place-room-fill", onMouseDown);
      map.off("mousedown", "place-room-handle", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      map.off("mouseenter", "place-room-fill", onEnter);
      map.off("mouseenter", "place-room-handle", onEnter);
      map.off("mouseleave", "place-room-fill", onLeave);
      map.off("mouseleave", "place-room-handle", onLeave);
    };
  }, [mapReady, plan]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !markMode) return;

    map.getCanvas().style.cursor = "crosshair";
    const onClick = (event: mapboxgl.MapMouseEvent) => {
      setExtraStructures((current) => [
        ...current,
        {
          id: `estimated-structure-${Date.now()}`,
          label: "Existing Structure",
          footprint: structureRectAt(event.lngLat.lng, event.lngLat.lat) as StructureFootprint["footprint"],
          source: "estimated",
        },
      ]);
      setMarkMode(false);
    };
    map.on("click", onClick);

    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [mapReady, markMode]);

  function handleCustomize() {
    if (!placementResult.validPlacement) return;
    const validationMessages = [
      ...placementResult.blockers,
      ...placementResult.warnings,
      ...placementResult.unknowns,
    ];

    saveSelectedRoomPlacement(
      cabnPlacementToRoomPlacement({
        model: selectedModel,
        placement,
        isValid: placementResult.validPlacement,
        validationMessages: validationMessages.length
          ? validationMessages
          : ["Placement passed current early-screening rules."],
      }),
    );
    window.location.assign("/customize-room");
  }

  if (!plan) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] p-5 text-[#111817]">
        <div className="max-w-xl rounded-[32px] border border-white/80 bg-white p-6 text-center shadow-[0_28px_90px_rgba(22,24,23,0.14)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#203b2c] text-white">
            <MapPinned className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold">Select a lot first</h1>
          <p className="mt-3 text-sm leading-6 text-[#66716a]">
            Choose a land parcel or search an owned property, then use Select Lot
            to open the focused placement stage.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/find-land"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#203b2c] px-4 text-sm font-semibold text-white"
            >
              Find land
            </Link>
            <Link
              href="/property-fit"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#eef3ef] px-4 text-sm font-semibold text-[#203b2c]"
            >
              Use my property
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-[#111817]">
      <div className="grid min-h-screen lg:grid-cols-[360px_minmax(0,1fr)_360px]">
        <aside className="z-10 flex flex-col gap-4 border-r border-[#e8ebe6] bg-white/94 p-5 shadow-[18px_0_55px_rgba(22,24,23,0.08)]">
          <div className="flex items-center justify-between">
            <Link
              href={backHref}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#f7f6f2] px-3 text-sm font-semibold text-[#27302b]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Lot Details
            </Link>
            <span className="rounded-full bg-[#eef7f8] px-3 py-1 text-xs font-semibold uppercase text-[#2b6f83]">
              Place Your Room
            </span>
          </div>

          <div>
            <h1 className="text-3xl font-semibold">Place Your Room</h1>
            <p className="mt-3 text-sm leading-6 text-[#66716a]">
              Drag the white footprint around the selected property. This is a
              lightweight planning preview, not a legal site plan.
            </p>
          </div>

          <section className="rounded-[26px] bg-[#f7f6f2] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Home className="h-4 w-4 text-[#203b2c]" aria-hidden="true" />
              Selected room
            </div>
            <div className="rounded-2xl bg-white p-4">
              <div className="text-lg font-semibold">{selectedModel.name}</div>
              <div className="mt-1 font-mono text-sm font-semibold text-[#203b2c]">
                {selectedModel.widthFt} x {selectedModel.lengthFt} ft ·{" "}
                {selectedModel.squareFeet} sq ft
              </div>
              <p className="mt-3 text-sm leading-6 text-[#66716a]">
                {selectedModel.description}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {cabnModels.map((model) => {
                const active = model.id === selectedModel.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setSelectedModelId(model.id);
                    }}
                    className={`rounded-2xl border p-3 text-left text-xs font-semibold transition ${
                      active
                        ? "border-[#203b2c] bg-[#203b2c] text-white"
                        : "border-[#e5e9e4] bg-white text-[#27302b]"
                    }`}
                  >
                    {model.name}
                    <span className="mt-1 block opacity-75">
                      {model.widthFt} x {model.lengthFt}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[26px] bg-[#f7f6f2] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MapPinned className="h-4 w-4 text-[#2b6f83]" aria-hidden="true" />
              Selected lot
            </div>
            <div className="rounded-2xl bg-white p-4">
              <div className="text-xs font-semibold uppercase text-[#66716a]">
                {sourceLabel(plan)}
              </div>
              <div className="mt-1 font-semibold">{plan.lot.title}</div>
              <p className="mt-1 text-sm leading-6 text-[#66716a]">
                {plan.lot.address ?? "Address unavailable"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                {plan.lot.acreage ? (
                  <span className="rounded-full bg-[#eef7f0] px-3 py-1 text-[#203b2c]">
                    {formatAcres(plan.lot.acreage)}
                  </span>
                ) : null}
                <span className="rounded-full bg-[#eef7f8] px-3 py-1 text-[#2b6f83]">
                  {plan.lot.boundaryIsEstimated ? "Estimated boundary" : "Parcel boundary"}
                </span>
              </div>
            </div>
            {plan.lot.sourceMessage ? (
              <p className="mt-3 text-xs leading-5 text-[#66716a]">
                {plan.lot.sourceMessage}
              </p>
            ) : null}
          </section>

          <section className="rounded-[26px] bg-[#f7f6f2] p-4">
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
              onChange={(event) => {
                setPlacement((current) => ({
                  ...current,
                  rotationDeg: Number(event.target.value),
                }));
              }}
              className="mt-3 w-full accent-[#203b2c]"
              aria-label="Rotate room footprint"
            />
            <p className="mt-2 text-xs leading-5 text-[#66716a]">
              Rotation is approximate for MVP placement and will become more exact
              in the customization stage.
            </p>
          </section>
        </aside>

        <section className="relative min-h-[60vh] lg:min-h-screen">
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
          <div ref={mapNode} className="absolute inset-0 h-full min-h-[60vh] w-full lg:min-h-screen" />
          <div className="pointer-events-none absolute bottom-5 left-5 rounded-full border border-white/70 bg-white/88 px-4 py-2 text-xs font-semibold text-[#58625c] shadow-[0_18px_55px_rgba(22,24,23,0.12)] backdrop-blur-2xl">
            <Move className="mr-2 inline h-4 w-4 text-[#203b2c]" aria-hidden="true" />
            Drag the white room footprint
          </div>
        </section>

        <aside className="z-10 flex flex-col gap-4 border-l border-[#e8ebe6] bg-white/94 p-5 shadow-[-18px_0_55px_rgba(22,24,23,0.08)]">
          <div className={`rounded-[26px] border p-4 ${fitTone(placementResult)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Live placement status</div>
                <div className="mt-1 text-2xl font-semibold">
                  {statusMessage(placementResult)}
                </div>
              </div>
              <div className="font-mono text-3xl font-semibold">
                {placementResult.score}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-white/65 px-3 py-1">
                {placementResult.status}
              </span>
              <span className="rounded-full bg-white/65 px-3 py-1">
                Confidence: {placementResult.confidence}
              </span>
            </div>
          </div>

          <section className="rounded-[26px] bg-[#f7f6f2] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Ruler className="h-4 w-4 text-[#203b2c]" aria-hidden="true" />
              Placement rules
            </div>
            <ul className="grid gap-2 text-sm leading-5 text-[#56625c]">
              <li>Room footprint must stay inside the lot boundary.</li>
              <li>Keep at least 5 ft from known structures.</li>
              <li>Do not overlap known existing structures.</li>
              <li>Basic setback screening uses the selected model rules.</li>
            </ul>
          </section>

          <section className="rounded-[26px] bg-[#f7f6f2] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Existing structures</div>
              <button
                type="button"
                onClick={() => setMarkMode((active) => !active)}
                className={`rounded-2xl px-3 py-2 text-xs font-semibold ${
                  markMode
                    ? "bg-[#203b2c] text-white"
                    : "bg-white text-[#27302b]"
                }`}
              >
                {markMode ? "Click map" : "Mark structure"}
              </button>
            </div>
            {structures.length ? (
              <ul className="grid gap-2 text-sm text-[#56625c]">
                {structures.map((structure) => (
                  <li key={structure.id} className="rounded-2xl bg-white px-3 py-2">
                    {structure.label} · {structure.source}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-white px-3 py-2 text-sm leading-6 text-[#66716a]">
                {structuresAvailable
                  ? "No existing structures are known for this lot."
                  : "Structure data unavailable — placement requires verification."}
              </p>
            )}
          </section>

          <section className="grid gap-3 overflow-y-auto rounded-[26px] bg-white p-4 text-sm premium-scrollbar">
            <div>
              <h2 className="mb-2 font-semibold">Blockers</h2>
              <ul className="grid gap-1.5 text-[#8b3f35]">
                {listItems(placementResult.blockers, "No hard blockers detected.")}
              </ul>
            </div>
            <div>
              <h2 className="mb-2 font-semibold">Warnings</h2>
              <ul className="grid gap-1.5 text-[#715520]">
                {listItems(placementResult.warnings, "No warnings yet.")}
              </ul>
            </div>
            <div>
              <h2 className="mb-2 font-semibold">Unknowns</h2>
              <ul className="grid gap-1.5 text-[#56625c]">
                {listItems(placementResult.unknowns, "No unknowns yet.")}
              </ul>
            </div>
          </section>

          {plan.lot.boundaryIsEstimated || !structuresAvailable ? (
            <div className="flex items-start gap-2 rounded-[22px] bg-[#fff6df] p-4 text-sm leading-6 text-[#715520]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {plan.lot.boundaryIsEstimated
                  ? "Boundary is estimated. "
                  : ""}
                {!structuresAvailable
                  ? "Structure data unavailable — manual verification required."
                  : "Confirm dimensions and setbacks before build planning."}
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-[22px] bg-[#eef7f0] p-4 text-sm leading-6 text-[#203b2c]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Parcel boundary is available. Continue only after reviewing the
                early-screening rules.
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={!placementResult.validPlacement}
            onClick={handleCustomize}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#203b2c] px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#2e523e] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Next: Customize Room
          </button>
        </aside>
      </div>
    </main>
  );
}
