import type { CABNModel } from "@/lib/cabnModels";
import {
  centroidOfGeometry,
  feetToLat,
  feetToLng,
  type CABNPlacement,
  type YardGeometry,
  type YardPolygon,
} from "@/lib/yardGeometry";
import type { Parcel } from "@/types/parcel";

export const SELECTED_ROOM_PLAN_STORAGE_KEY = "tonyville:selected-room-plan:v1";

export const CABN_WALLS = ["north", "east", "south", "west"] as const;

export type CABNWall = (typeof CABN_WALLS)[number];

export type CABNCustomization = {
  windowWall: CABNWall;
  doorWall: CABNWall;
  deskWall: CABNWall;
  builtInsWall: CABNWall;
  majorViewWall?: CABNWall;
};

export const DEFAULT_CABN_CUSTOMIZATION: CABNCustomization = {
  windowWall: "north",
  doorWall: "east",
  deskWall: "south",
  builtInsWall: "north",
};

export type StructureFootprint = {
  id: string;
  label: string;
  footprint: YardPolygon;
  source: "attom" | "mock" | "estimated";
};

export type SelectedLot = {
  id: string;
  source: "land_search" | "owned_property";
  provider?: Parcel["provider"];
  title: string;
  address?: string;
  city?: string;
  state?: string;
  lat: number;
  lng: number;
  lotSizeSqFt?: number;
  acreage?: number;
  boundary?: YardGeometry;
  boundaryIsEstimated?: boolean;
  structures?: StructureFootprint[];
  structuresAvailable?: boolean;
  sourceMessage?: string;
  backHref?: string;
};

export type RoomPlacement = {
  modelId: string;
  centerLat: number;
  centerLng: number;
  widthFt: number;
  lengthFt: number;
  rotationDeg: number;
  isValid: boolean;
  validationMessages: string[];
};

export type SelectedRoomPlan = {
  selectedAt: string;
  modelId: string;
  lot: SelectedLot;
  placement?: RoomPlacement;
  customization?: CABNCustomization;
};

function isLngLat(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function isYardGeometry(value: unknown): value is YardGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type === "Polygon") {
    const ring = Array.isArray(geometry.coordinates)
      ? geometry.coordinates[0]
      : undefined;
    return Array.isArray(ring) && ring.some(isLngLat);
  }
  if (geometry.type === "MultiPolygon") {
    const ring = Array.isArray(geometry.coordinates)
      ? geometry.coordinates[0]?.[0]
      : undefined;
    return Array.isArray(ring) && ring.some(isLngLat);
  }
  return false;
}

function isCABNWall(value: unknown): value is CABNWall {
  return typeof value === "string" && CABN_WALLS.includes(value as CABNWall);
}

function isRoomPlacement(value: unknown): value is RoomPlacement {
  if (!value || typeof value !== "object") return false;
  const placement = value as Partial<RoomPlacement>;

  return (
    typeof placement.modelId === "string" &&
    typeof placement.centerLat === "number" &&
    typeof placement.centerLng === "number" &&
    typeof placement.widthFt === "number" &&
    typeof placement.lengthFt === "number" &&
    typeof placement.rotationDeg === "number" &&
    typeof placement.isValid === "boolean" &&
    Array.isArray(placement.validationMessages)
  );
}

function isLikelyVacantParcel(parcel: Parcel) {
  const text = [
    parcel.title,
    parcel.parcelUse,
    parcel.zoningSummary,
    ...parcel.highlights,
    ...parcel.constraints,
  ]
    .join(" ")
    .toLowerCase();

  return (
    text.includes("vacant") ||
    text.includes("land") ||
    text.includes("lot") ||
    text.includes("parcel geometry")
  );
}

export function createEstimatedBoundary(input: {
  lat: number;
  lng: number;
  lotSizeSqFt?: number;
}): YardPolygon {
  const sideFt = Math.max(70, Math.min(420, Math.sqrt(input.lotSizeSqFt ?? 12000)));
  const halfWidthLng = feetToLng(sideFt / 2, input.lat);
  const halfLengthLat = feetToLat(sideFt / 2);

  return {
    type: "Polygon",
    coordinates: [
      [
        [input.lng - halfWidthLng, input.lat - halfLengthLat],
        [input.lng + halfWidthLng, input.lat - halfLengthLat],
        [input.lng + halfWidthLng, input.lat + halfLengthLat],
        [input.lng - halfWidthLng, input.lat + halfLengthLat],
        [input.lng - halfWidthLng, input.lat - halfLengthLat],
      ],
    ],
  };
}

export function normalizeSelectedLotBoundary(lot: SelectedLot): SelectedLot {
  if (isYardGeometry(lot.boundary)) {
    return { ...lot, boundaryIsEstimated: Boolean(lot.boundaryIsEstimated) };
  }

  return {
    ...lot,
    boundary: createEstimatedBoundary({
      lat: lot.lat,
      lng: lot.lng,
      lotSizeSqFt: lot.lotSizeSqFt,
    }),
    boundaryIsEstimated: true,
  };
}

export function normalizeCABNCustomization(
  customization?: Partial<CABNCustomization> | null,
): CABNCustomization {
  return {
    windowWall: isCABNWall(customization?.windowWall)
      ? customization.windowWall
      : DEFAULT_CABN_CUSTOMIZATION.windowWall,
    doorWall: isCABNWall(customization?.doorWall)
      ? customization.doorWall
      : DEFAULT_CABN_CUSTOMIZATION.doorWall,
    deskWall: isCABNWall(customization?.deskWall)
      ? customization.deskWall
      : DEFAULT_CABN_CUSTOMIZATION.deskWall,
    builtInsWall: isCABNWall(customization?.builtInsWall)
      ? customization.builtInsWall
      : DEFAULT_CABN_CUSTOMIZATION.builtInsWall,
    majorViewWall: isCABNWall(customization?.majorViewWall)
      ? customization.majorViewWall
      : undefined,
  };
}

export function roomPlacementToCABNPlacement(
  placement: RoomPlacement,
): CABNPlacement {
  return {
    center: {
      lng: placement.centerLng,
      lat: placement.centerLat,
    },
    rotationDeg: placement.rotationDeg,
  };
}

export function cabnPlacementToRoomPlacement(input: {
  model: CABNModel;
  placement: CABNPlacement;
  isValid: boolean;
  validationMessages: string[];
}): RoomPlacement {
  return {
    modelId: input.model.id,
    centerLat: input.placement.center.lat,
    centerLng: input.placement.center.lng,
    widthFt: input.model.widthFt,
    lengthFt: input.model.lengthFt,
    rotationDeg: input.placement.rotationDeg,
    isValid: input.isValid,
    validationMessages: input.validationMessages,
  };
}

export function createFallbackRoomPlacement(
  plan: SelectedRoomPlan,
  model: CABNModel,
): RoomPlacement {
  const center = centroidOfGeometry(plan.lot.boundary, {
    lat: plan.lot.lat,
    lng: plan.lot.lng,
  });

  return {
    modelId: model.id,
    centerLat: center.lat,
    centerLng: center.lng,
    widthFt: model.widthFt,
    lengthFt: model.lengthFt,
    rotationDeg: 0,
    isValid: false,
    validationMessages: [
      "Placement was inferred from the lot center and needs placement confirmation.",
    ],
  };
}

export function normalizeSelectedRoomPlan(
  plan: SelectedRoomPlan,
): SelectedRoomPlan {
  return {
    ...plan,
    lot: normalizeSelectedLotBoundary(plan.lot),
    placement: isRoomPlacement(plan.placement) ? plan.placement : undefined,
    customization: normalizeCABNCustomization(plan.customization),
  };
}

export function parcelToSelectedLot(
  parcel: Parcel,
  input: {
    source: SelectedLot["source"];
    sourceMessage?: string;
    backHref?: string;
    structures?: StructureFootprint[];
    structuresAvailable?: boolean;
  },
): SelectedLot {
  const boundary = isYardGeometry(parcel.geometry) ? parcel.geometry : undefined;
  const center = centroidOfGeometry(boundary, { lat: parcel.lat, lng: parcel.lng });
  const lotSizeSqFt = Math.round(parcel.acreage * 43560);
  const likelyVacant = isLikelyVacantParcel(parcel);

  return normalizeSelectedLotBoundary({
    id: parcel.id,
    source: input.source,
    provider: parcel.provider,
    title: parcel.title,
    address: parcel.address,
    city: parcel.city,
    state: parcel.state,
    lat: center.lat,
    lng: center.lng,
    lotSizeSqFt,
    acreage: parcel.acreage,
    boundary,
    boundaryIsEstimated: !boundary,
    structures: input.structures ?? [],
    structuresAvailable: input.structuresAvailable ?? likelyVacant,
    sourceMessage: input.sourceMessage,
    backHref: input.backHref,
  });
}

export function createSelectedRoomPlan(input: {
  lot: SelectedLot;
  modelId: string;
}): SelectedRoomPlan {
  return {
    selectedAt: new Date().toISOString(),
    modelId: input.modelId,
    lot: normalizeSelectedLotBoundary(input.lot),
    customization: DEFAULT_CABN_CUSTOMIZATION,
  };
}

export function readSelectedRoomPlan(): SelectedRoomPlan | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SELECTED_ROOM_PLAN_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SelectedRoomPlan;
    if (!parsed?.lot || !parsed.modelId) return null;
    return normalizeSelectedRoomPlan(parsed);
  } catch {
    return null;
  }
}

export function writeSelectedRoomPlan(plan: SelectedRoomPlan) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SELECTED_ROOM_PLAN_STORAGE_KEY,
    JSON.stringify(normalizeSelectedRoomPlan(plan)),
  );
}

export function updateSelectedRoomPlan(
  updater: (plan: SelectedRoomPlan) => SelectedRoomPlan,
) {
  const current = readSelectedRoomPlan();
  if (!current) return null;

  const next = normalizeSelectedRoomPlan(updater(current));
  writeSelectedRoomPlan(next);
  return next;
}

export function saveSelectedRoomPlacement(placement: RoomPlacement) {
  return updateSelectedRoomPlan((plan) => ({
    ...plan,
    modelId: placement.modelId,
    placement,
  }));
}

export function saveSelectedRoomCustomization(
  customization: Partial<CABNCustomization>,
) {
  return updateSelectedRoomPlan((plan) => ({
    ...plan,
    customization: normalizeCABNCustomization({
      ...plan.customization,
      ...customization,
    }),
  }));
}
