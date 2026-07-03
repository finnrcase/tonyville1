import { CABN_WALLS, type CABNCustomization, type CABNWall } from "@/lib/placeRoom";

/**
 * Pure layout engine for the Edit Your CABN interior preview.
 *
 * Maps customization state (which wall each feature sits on) to concrete
 * positions along each wall. It is renderer-agnostic: the SVG preview consumes
 * these placements today, and a future Three.js / React Three Fiber scene can
 * consume the exact same output without touching the customization logic.
 */

export type InteriorItemId = "window" | "door" | "desk" | "builtins";

export const INTERIOR_ITEM_IDS: InteriorItemId[] = [
  "window",
  "door",
  "desk",
  "builtins",
];

export type InteriorItemPlacement = {
  id: InteriorItemId;
  wall: CABNWall;
  /** Center of the item along its wall, as a 0..1 ratio from the wall start. */
  ratio: number;
  /** Footprint of the item along the wall, in feet. */
  widthFt: number;
};

export type InteriorLayout = Record<InteriorItemId, InteriorItemPlacement>;

export type RoomDimensions = {
  widthFt: number;
  lengthFt: number;
};

/** North/south walls run east-west (room width); east/west walls run the length. */
export function wallLengthFt(wall: CABNWall, room: RoomDimensions) {
  return wall === "north" || wall === "south" ? room.widthFt : room.lengthFt;
}

export function wallForItem(
  id: InteriorItemId,
  customization: CABNCustomization,
): CABNWall {
  switch (id) {
    case "window":
      return customization.windowWall;
    case "door":
      return customization.doorWall;
    case "desk":
      return customization.deskWall;
    case "builtins":
      return customization.builtInsWall;
  }
}

/** Drawing order along a shared wall: storage first, door nearest a corner. */
const SHARED_WALL_ORDER: InteriorItemId[] = ["builtins", "window", "desk", "door"];

const CORNER_MARGIN_FT = 0.9;
const MIN_SHARED_GAP_FT = 0.8;

function preferredWidthFt(
  id: InteriorItemId,
  wallLen: number,
  sharesWall: boolean,
) {
  switch (id) {
    case "door":
      return 3;
    case "window":
      return Math.min(6, wallLen * 0.42);
    case "desk":
      return Math.min(5, wallLen * 0.4);
    case "builtins":
      return sharesWall
        ? Math.max(3.5, wallLen * 0.28)
        : Math.max(4.5, wallLen * 0.52);
  }
}

/**
 * Computes non-overlapping placements for every interior item. Items alone on
 * a wall are centered; items sharing a wall are justified across the usable
 * span with even gaps, shrinking proportionally when the wall is too short.
 */
export function computeInteriorLayout(
  customization: CABNCustomization,
  room: RoomDimensions,
): InteriorLayout {
  const layout = {} as InteriorLayout;

  for (const wall of CABN_WALLS) {
    const ids = SHARED_WALL_ORDER.filter(
      (id) => wallForItem(id, customization) === wall,
    );
    if (!ids.length) continue;

    const wallLen = wallLengthFt(wall, room);
    const margin = Math.min(CORNER_MARGIN_FT, wallLen * 0.08);
    const usable = wallLen - margin * 2;
    let widths = ids.map((id) => preferredWidthFt(id, wallLen, ids.length > 1));

    if (ids.length === 1) {
      layout[ids[0]] = {
        id: ids[0],
        wall,
        ratio: 0.5,
        widthFt: Math.min(widths[0], usable),
      };
      continue;
    }

    const gapCount = ids.length - 1;
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    let gap = (usable - totalWidth) / gapCount;

    if (gap < MIN_SHARED_GAP_FT) {
      const scale = Math.max(
        0.1,
        (usable - MIN_SHARED_GAP_FT * gapCount) / totalWidth,
      );
      widths = widths.map((width) => width * scale);
      gap = MIN_SHARED_GAP_FT;
    }

    let cursor = margin;
    ids.forEach((id, index) => {
      const width = widths[index];
      layout[id] = {
        id,
        wall,
        ratio: (cursor + width / 2) / wallLen,
        widthFt: width,
      };
      cursor += width + gap;
    });
  }

  return layout;
}
