"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { Layers, LocateFixed, MapPinned } from "lucide-react";
import type {
  MapSearchCenter,
  MapStyleMode,
  ScoredParcel,
  SearchCenter,
} from "@/types/parcel";

type MapViewProps = {
  className?: string;
  mapboxToken: string;
  parcels: ScoredParcel[];
  center: SearchCenter;
  selectedParcelId?: string;
  hoveredParcelId?: string;
  mapStyle: MapStyleMode;
  loading: boolean;
  onMapStyleChange: (style: MapStyleMode) => void;
  onSelectParcel: (parcelId: string) => void;
  onHoverParcel: (parcelId?: string) => void;
  onSearchAreaChange: (center: MapSearchCenter) => void;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number | boolean>;
    geometry:
      | { type: "Point"; coordinates: [number, number] }
      | NonNullable<ScoredParcel["geometry"]>;
  }>;
};

type OverlayMarker =
  | {
      type: "parcel";
      id: string;
      title: string;
      score: number;
      x: number;
      y: number;
      selected: boolean;
      hovered: boolean;
    }
  | {
      type: "cluster";
      id: string;
      count: number;
      x: number;
      y: number;
      lng: number;
      lat: number;
    };

const mapboxStyleUrls = {
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
} satisfies Record<MapStyleMode, string>;

function buildPointData(
  parcels: ScoredParcel[],
  selectedParcelId?: string,
  hoveredParcelId?: string,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parcels.map((parcel) => ({
      type: "Feature",
      properties: {
        id: parcel.id,
        title: parcel.title,
        score: parcel.fitScore.total,
        selected: parcel.id === selectedParcelId,
        hovered: parcel.id === hoveredParcelId,
      },
      geometry: {
        type: "Point",
        coordinates: [parcel.lng, parcel.lat],
      },
    })),
  };
}

function buildPolygonData(
  parcels: ScoredParcel[],
  selectedParcelId?: string,
  hoveredParcelId?: string,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parcels
      .filter((parcel) => parcel.geometry)
      .map((parcel) => ({
        type: "Feature",
        properties: {
          id: parcel.id,
          selected: parcel.id === selectedParcelId,
          hovered: parcel.id === hoveredParcelId,
          score: parcel.fitScore.total,
          title: parcel.title,
        },
        geometry: parcel.geometry!,
      })),
  };
}

function upsertGeoJsonSource(
  map: mapboxgl.Map,
  id: string,
  data: FeatureCollection,
  options?: Omit<mapboxgl.GeoJSONSourceSpecification, "type" | "data">,
) {
  const source = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;

  if (source) {
    source.setData(data as Parameters<mapboxgl.GeoJSONSource["setData"]>[0]);
    return;
  }

  map.addSource(id, {
    type: "geojson",
    data: data as mapboxgl.GeoJSONSourceSpecification["data"],
    ...options,
  });
}

function ensureParcelLayers(
  map: mapboxgl.Map,
  pointData: FeatureCollection,
  polygonData: FeatureCollection,
) {
  upsertGeoJsonSource(map, "parcel-polygons", polygonData);

  if (!map.getLayer("parcel-fill")) {
    map.addLayer({
      id: "parcel-fill",
      type: "fill",
      source: "parcel-polygons",
      paint: {
        "fill-color": [
          "case",
          ["get", "selected"],
          "#f6c85f",
          ["get", "hovered"],
          "#3f7351",
          "#263b2c",
        ],
        "fill-opacity": [
          "case",
          ["get", "selected"],
          0.34,
          ["get", "hovered"],
          0.24,
          0.12,
        ],
      },
    });
  }

  if (!map.getLayer("parcel-outline")) {
    map.addLayer({
      id: "parcel-outline",
      type: "line",
      source: "parcel-polygons",
      paint: {
        "line-color": [
          "case",
          ["get", "selected"],
          "#f6c85f",
          ["get", "hovered"],
          "#ffffff",
          "#263b2c",
        ],
        "line-width": ["case", ["get", "selected"], 4, ["get", "hovered"], 3, 1.5],
      },
    });
  }

  upsertGeoJsonSource(map, "parcel-points", pointData, {
    cluster: true,
    clusterMaxZoom: 10,
    clusterRadius: 48,
  });

  if (!map.getLayer("clusters")) {
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "parcel-points",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#263b2c",
        "circle-radius": ["step", ["get", "point_count"], 18, 6, 23, 12, 30],
        "circle-stroke-color": "#fffaf0",
        "circle-stroke-width": 2,
      },
    });
  }

  if (!map.getLayer("cluster-count")) {
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "parcel-points",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: { "text-color": "#ffffff" },
    });
  }

  if (!map.getLayer("parcel-points")) {
    map.addLayer({
      id: "parcel-points",
      type: "circle",
      source: "parcel-points",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": [
          "case",
          ["get", "selected"],
          "#f6c85f",
          ["get", "hovered"],
          "#3f7351",
          ["<", ["get", "score"], 70],
          "#9a7032",
          "#263b2c",
        ],
        "circle-radius": ["case", ["get", "selected"], 17, ["get", "hovered"], 15, 12],
        "circle-stroke-color": "#fffaf0",
        "circle-stroke-width": ["case", ["get", "selected"], 4, 2],
      },
    });
  }

  if (!map.getLayer("parcel-score-labels")) {
    map.addLayer({
      id: "parcel-score-labels",
      type: "symbol",
      source: "parcel-points",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["to-string", ["get", "score"]],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 11,
      },
      paint: { "text-color": "#ffffff" },
    });
  }
}

function getFeatureProperty(feature: unknown, key: string) {
  if (!feature || typeof feature !== "object" || !("properties" in feature)) {
    return undefined;
  }

  const properties = (feature as { properties?: Record<string, unknown> })
    .properties;

  return properties?.[key];
}

function getPointCoordinates(feature: unknown) {
  if (!feature || typeof feature !== "object" || !("geometry" in feature)) {
    return undefined;
  }

  const geometry = (feature as { geometry?: { type?: string; coordinates?: unknown } })
    .geometry;

  if (
    geometry?.type === "Point" &&
    Array.isArray(geometry.coordinates) &&
    typeof geometry.coordinates[0] === "number" &&
    typeof geometry.coordinates[1] === "number"
  ) {
    return [geometry.coordinates[0], geometry.coordinates[1]] as [number, number];
  }

  return undefined;
}

function buildOverlayMarkers(
  map: mapboxgl.Map,
  parcels: ScoredParcel[],
  selectedParcelId?: string,
  hoveredParcelId?: string,
): OverlayMarker[] {
  const zoom = map.getZoom();
  const projected = parcels.map((parcel) => {
    const point = map.project([parcel.lng, parcel.lat]);

    return {
      parcel,
      x: point.x,
      y: point.y,
    };
  });

  if (zoom >= 8.2) {
    return projected.map(({ parcel, x, y }) => ({
      type: "parcel",
      id: parcel.id,
      title: parcel.title,
      score: parcel.fitScore.total,
      x,
      y,
      selected: parcel.id === selectedParcelId,
      hovered: parcel.id === hoveredParcelId,
    }));
  }

  const groups = new Map<string, typeof projected>();

  projected.forEach((item) => {
    const key = `${Math.round(item.x / 78)}:${Math.round(item.y / 78)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });

  return Array.from(groups.entries()).map(([key, items]) => {
    if (items.length === 1) {
      const parcel = items[0].parcel;

      return {
        type: "parcel",
        id: parcel.id,
        title: parcel.title,
        score: parcel.fitScore.total,
        x: items[0].x,
        y: items[0].y,
        selected: parcel.id === selectedParcelId,
        hovered: parcel.id === hoveredParcelId,
      };
    }

    const totals = items.reduce(
      (sum, item) => ({
        x: sum.x + item.x,
        y: sum.y + item.y,
        lng: sum.lng + item.parcel.lng,
        lat: sum.lat + item.parcel.lat,
      }),
      { x: 0, y: 0, lng: 0, lat: 0 },
    );

    return {
      type: "cluster",
      id: key,
      count: items.length,
      x: totals.x / items.length,
      y: totals.y / items.length,
      lng: totals.lng / items.length,
      lat: totals.lat / items.length,
    };
  });
}

export function MapView({
  className = "",
  mapboxToken,
  parcels,
  center,
  selectedParcelId,
  hoveredParcelId,
  mapStyle,
  loading,
  onMapStyleChange,
  onSelectParcel,
  onHoverParcel,
  onSearchAreaChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pointDataRef = useRef<FeatureCollection>(buildPointData([]));
  const polygonDataRef = useRef<FeatureCollection>(buildPolygonData([]));
  const parcelsRef = useRef(parcels);
  const selectedParcelIdRef = useRef(selectedParcelId);
  const hoveredParcelIdRef = useRef(hoveredParcelId);
  const initialMapStyleRef = useRef(mapStyle);
  const initialCenterRef = useRef(center);
  const programmaticMoveRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [overlayMarkers, setOverlayMarkers] = useState<OverlayMarker[]>([]);

  const pointData = useMemo(
    () => buildPointData(parcels, selectedParcelId, hoveredParcelId),
    [hoveredParcelId, parcels, selectedParcelId],
  );
  const polygonData = useMemo(
    () => buildPolygonData(parcels, selectedParcelId, hoveredParcelId),
    [hoveredParcelId, parcels, selectedParcelId],
  );

  useEffect(() => {
    parcelsRef.current = parcels;
    selectedParcelIdRef.current = selectedParcelId;
    hoveredParcelIdRef.current = hoveredParcelId;
  }, [hoveredParcelId, parcels, selectedParcelId]);

  useEffect(() => {
    if (!containerRef.current || !mapboxToken || mapRef.current) {
      return;
    }

    let mounted = true;

    async function loadMap() {
      try {
        const mapboxModule = await import("mapbox-gl");
        const mapbox = mapboxModule.default;

        if (!mounted || !containerRef.current) {
          return;
        }

        mapbox.accessToken = mapboxToken;
        mapboxRef.current = mapbox;

        const map = new mapbox.Map({
          container: containerRef.current,
          style: mapboxStyleUrls[initialMapStyleRef.current],
          center: [initialCenterRef.current.lng, initialCenterRef.current.lat],
          zoom: 8.4,
          attributionControl: false,
        });

        mapRef.current = map;
        resizeObserverRef.current = new ResizeObserver(() => {
          map.resize();
        });
        resizeObserverRef.current.observe(containerRef.current);
        map.addControl(
          new mapbox.NavigationControl({ visualizePitch: true }),
          "bottom-right",
        );
        map.addControl(
          new mapbox.AttributionControl({ compact: true }),
          "bottom-left",
        );

        map.on("load", () => {
          map.resize();
          ensureParcelLayers(map, pointDataRef.current, polygonDataRef.current);
          setOverlayMarkers(
            buildOverlayMarkers(
              map,
              parcelsRef.current,
              selectedParcelIdRef.current,
              hoveredParcelIdRef.current,
            ),
          );
          setMapReady(true);
        });

        map.on("error", (event) => {
          const message =
            event.error instanceof Error
              ? event.error.message
              : "Unknown Mapbox error";
          console.error(`[Tonyville map] ${message}`);

          if (!map.loaded()) {
            setMapError(
              "Mapbox could not finish loading. Check NEXT_PUBLIC_MAPBOX_TOKEN and Vercel env vars.",
            );
          }
        });

        map.on("style.load", () => {
          ensureParcelLayers(map, pointDataRef.current, polygonDataRef.current);
        });

        map.on("click", "parcel-points", (event) => {
          const id = getFeatureProperty(event.features?.[0], "id");

          if (typeof id === "string") {
            onSelectParcel(id);
          }
        });

        map.on("click", "clusters", (event) => {
          const coordinates = getPointCoordinates(event.features?.[0]);

          if (coordinates) {
            map.easeTo({
              center: coordinates,
              zoom: Math.min(map.getZoom() + 2.4, 12),
              duration: 650,
            });
          }
        });

        map.on("mousemove", "parcel-points", (event) => {
          map.getCanvas().style.cursor = "pointer";
          const id = getFeatureProperty(event.features?.[0], "id");
          onHoverParcel(typeof id === "string" ? id : undefined);
        });

        map.on("mouseleave", "parcel-points", () => {
          map.getCanvas().style.cursor = "";
          onHoverParcel(undefined);
        });

        map.on("moveend", () => {
          setOverlayMarkers(
            buildOverlayMarkers(
              map,
              parcelsRef.current,
              selectedParcelIdRef.current,
              hoveredParcelIdRef.current,
            ),
          );

          if (programmaticMoveRef.current) {
            programmaticMoveRef.current = false;
            return;
          }

          const mapCenter = map.getCenter();
          onSearchAreaChange({
            label: "Map search area",
            lat: mapCenter.lat,
            lng: mapCenter.lng,
            source: "map",
          });
        });
      } catch {
        if (mounted) {
          setMapError("Mapbox could not load. Check the token and local network.");
        }
      }
    }

    loadMap();

    return () => {
      mounted = false;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [
    mapboxToken,
    onHoverParcel,
    onSearchAreaChange,
    onSelectParcel,
  ]);

  useEffect(() => {
    pointDataRef.current = pointData;
    polygonDataRef.current = polygonData;

    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    ensureParcelLayers(map, pointData, polygonData);
    const frameId = window.requestAnimationFrame(() => {
      setOverlayMarkers(
        buildOverlayMarkers(map, parcels, selectedParcelId, hoveredParcelId),
      );
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    hoveredParcelId,
    mapReady,
    parcels,
    pointData,
    polygonData,
    selectedParcelId,
  ]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    map.setStyle(mapboxStyleUrls[mapStyle]);
    setMapError("");
  }, [mapReady, mapStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady || parcels.length > 0) {
      return;
    }

    programmaticMoveRef.current = true;
    map.flyTo({
      center: [center.lng, center.lat],
      zoom: 10,
      duration: 700,
    });
  }, [center.lat, center.lng, mapReady, parcels.length]);

  useEffect(() => {
    const map = mapRef.current;
    const mapbox = mapboxRef.current;

    if (!map || !mapbox || !mapReady || parcels.length === 0) {
      return;
    }

    const bounds = new mapbox.LngLatBounds();
    parcels.forEach((parcel) => bounds.extend([parcel.lng, parcel.lat]));
    const compactPadding = window.innerWidth < 640;
    programmaticMoveRef.current = true;
    map.fitBounds(bounds, {
      padding: {
        top: compactPadding ? 150 : 88,
        bottom: 88,
        left: compactPadding ? 44 : 88,
        right: compactPadding ? 44 : 88,
      },
      maxZoom: 11,
      duration: 800,
    });
  }, [mapReady, parcels]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition((position) => {
      const current = {
        label: "Current location",
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        source: "currentLocation" as const,
      };

      mapRef.current?.flyTo({
        center: [current.lng, current.lat],
        zoom: 10,
        duration: 750,
      });
      onSearchAreaChange(current);
    });
  };

  if (!mapboxToken) {
    return (
      <section
        className={`flex min-h-[520px] items-center justify-center overflow-hidden bg-[#eef1ec] p-6 text-center ${className}`}
      >
        <div>
          <MapPinned className="mx-auto h-8 w-8 text-[#263b2c]" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-[#211d17]">Mapbox token needed</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#665a47]">
            Add `NEXT_PUBLIC_MAPBOX_TOKEN` to render the live Tonyville map.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`relative min-h-[560px] overflow-hidden bg-[#eef1ec] ${className}`}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {!mapReady || mapError ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/72 backdrop-blur-[2px]">
          <div className="mx-6 max-w-sm rounded-[28px] border border-white/70 bg-white/92 p-5 text-center shadow-[0_22px_70px_rgba(22,24,23,0.16)] backdrop-blur-xl">
            <MapPinned
              className="mx-auto h-7 w-7 text-[#203b2c]"
              aria-hidden="true"
            />
            <h2 className="mt-3 text-base font-semibold text-[#111817]">
              {mapError ? "Map temporarily unavailable" : "Loading Tonyville map"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#66716a]">
              {mapError ||
                "Preparing parcel boundaries, clusters, and search controls."}
            </p>
            {!mapError ? (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf0ec]">
                <div className="soft-pulse h-full w-1/2 rounded-full bg-[#b9d7e7]" />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0">
        {overlayMarkers.map((marker) => {
          if (marker.type === "cluster") {
            return (
              <button
                key={marker.id}
                type="button"
                onClick={() => {
                  mapRef.current?.easeTo({
                    center: [marker.lng, marker.lat],
                    zoom: Math.min((mapRef.current?.getZoom() ?? 8) + 2.5, 12),
                    duration: 650,
                  });
                }}
                className="pointer-events-auto absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-white bg-[#203b2c] text-sm font-bold text-white shadow-[0_14px_34px_rgba(13,31,22,0.22)] transition duration-200 hover:scale-110"
                style={{ left: marker.x, top: marker.y }}
                aria-label={`Zoom to ${marker.count} parcels`}
                title={`${marker.count} parcels`}
              >
                {marker.count}
              </button>
            );
          }

          return (
            <button
              key={marker.id}
              type="button"
              onClick={() => onSelectParcel(marker.id)}
              onMouseEnter={() => onHoverParcel(marker.id)}
              onMouseLeave={() => onHoverParcel(undefined)}
              className={`pointer-events-auto absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] text-xs font-bold shadow-[0_14px_34px_rgba(13,31,22,0.22)] transition duration-200 hover:scale-110 ${
                marker.selected
                  ? "border-white bg-[#203b2c] text-white ring-4 ring-[#a8cfe1]/70"
                  : marker.hovered
                    ? "border-white bg-[#2d6b7f] text-white"
                    : "border-white bg-[#203b2c] text-white"
              }`}
              style={{ left: marker.x, top: marker.y }}
              aria-label={`Select ${marker.title}`}
              title={`${marker.title}: ${marker.score}`}
            >
              {marker.score}
            </button>
          );
        })}
      </div>

      <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2 md:left-[448px]">
        <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-[0_16px_40px_rgba(22,24,23,0.12)] backdrop-blur-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-[#203b2c]">
            <MapPinned className="h-4 w-4" aria-hidden="true" />
            {center.label}
          </div>
        </div>
        {loading ? (
          <div className="soft-pulse rounded-full bg-[#203b2c] px-3 py-2 text-xs font-bold text-white shadow-sm">
            Searching...
          </div>
        ) : null}
      </div>

      <div className="absolute left-4 top-20 flex gap-1 rounded-2xl border border-white/70 bg-white/90 p-1.5 shadow-[0_16px_40px_rgba(22,24,23,0.12)] backdrop-blur-xl sm:left-auto sm:right-5 sm:top-5">
        <button
          type="button"
          onClick={() => onMapStyleChange("streets")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition duration-200 ${
            mapStyle === "streets"
              ? "bg-[#203b2c] text-white shadow-sm"
              : "text-[#343a36] hover:bg-[#f3f7f8]"
          }`}
        >
          <Layers className="h-4 w-4" aria-hidden="true" />
          Streets
        </button>
        <button
          type="button"
          onClick={() => onMapStyleChange("satellite")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition duration-200 ${
            mapStyle === "satellite"
              ? "bg-[#203b2c] text-white shadow-sm"
              : "text-[#343a36] hover:bg-[#f3f7f8]"
          }`}
        >
          Satellite
        </button>
        <button
          type="button"
          onClick={useCurrentLocation}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#343a36] transition hover:bg-[#f3f7f8]"
          aria-label="Use current location"
          title="Use current location"
        >
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="absolute bottom-5 left-4 right-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-xs font-semibold text-[#56605a] shadow-[0_16px_40px_rgba(22,24,23,0.12)] backdrop-blur-xl md:left-[448px] md:right-[452px]">
        <span>
          {parcels.length > 0
            ? `${parcels.length} lots visible`
            : "No lots visible"}
        </span>
        <span>
          {parcels.length > 0
            ? "Pan or zoom the map to search that area"
            : "Relax filters or expand the radius to bring parcels back"}
        </span>
      </div>
    </section>
  );
}
