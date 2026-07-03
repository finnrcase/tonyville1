import type { CABNWall } from "@/lib/placeRoom";

export type PreviewPoint = {
  x: number;
  y: number;
};

export type PreviewEdge = {
  id: CABNWall;
  start: PreviewPoint;
  end: PreviewPoint;
  midpoint: PreviewPoint;
  outwardNormal: PreviewPoint;
};

export type CabnInteriorItemId = "window" | "door" | "desk" | "builtins";

export type CabnInteriorItem = {
  id: CabnInteriorItemId;
  label: string;
  wall: CABNWall;
};

export type WallAnchor = {
  itemId: CabnInteriorItemId;
  wall: CABNWall;
  edge: PreviewEdge;
  markerPoint: PreviewPoint;
  insidePoint: PreviewPoint;
  labelPoint: PreviewPoint;
  leaderBendPoint: PreviewPoint;
  edgeRatio: number;
  tangent: PreviewPoint;
};

const CARDINAL_VECTORS: Record<CABNWall, PreviewPoint> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

const INTERIOR_ITEM_ORDER: CabnInteriorItemId[] = [
  "window",
  "door",
  "desk",
  "builtins",
];

const DEFAULT_ITEM_RATIOS: Record<CabnInteriorItemId, number> = {
  window: 0.34,
  door: 0.66,
  desk: 0.5,
  builtins: 0.5,
};

const LOCAL_EDGES: Array<{
  id: CABNWall;
  start: PreviewPoint;
  end: PreviewPoint;
  outwardNormal: PreviewPoint;
}> = [
  {
    id: "north",
    start: { x: -0.5, y: -0.5 },
    end: { x: 0.5, y: -0.5 },
    outwardNormal: { x: 0, y: -1 },
  },
  {
    id: "east",
    start: { x: 0.5, y: -0.5 },
    end: { x: 0.5, y: 0.5 },
    outwardNormal: { x: 1, y: 0 },
  },
  {
    id: "south",
    start: { x: 0.5, y: 0.5 },
    end: { x: -0.5, y: 0.5 },
    outwardNormal: { x: 0, y: 1 },
  },
  {
    id: "west",
    start: { x: -0.5, y: 0.5 },
    end: { x: -0.5, y: -0.5 },
    outwardNormal: { x: -1, y: 0 },
  },
];

function rotateClockwise(point: PreviewPoint, degrees: number): PreviewPoint {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: point.x * cos + point.y * sin,
    y: -point.x * sin + point.y * cos,
  };
}

function dot(a: PreviewPoint, b: PreviewPoint) {
  return a.x * b.x + a.y * b.y;
}

function midpoint(a: PreviewPoint, b: PreviewPoint): PreviewPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function length(point: PreviewPoint) {
  return Math.hypot(point.x, point.y) || 1;
}

function normalize(point: PreviewPoint): PreviewPoint {
  const pointLength = length(point);

  return {
    x: point.x / pointLength,
    y: point.y / pointLength,
  };
}

function scaleLocalPoint(
  point: PreviewPoint,
  widthFt: number,
  lengthFt: number,
): PreviewPoint {
  return {
    x: point.x * widthFt,
    y: point.y * lengthFt,
  };
}

export function getRotatedCabnCorners(input: {
  widthFt: number;
  lengthFt: number;
  rotationDeg: number;
}): PreviewPoint[] {
  return [
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
    { x: 0.5, y: 0.5 },
    { x: -0.5, y: 0.5 },
  ].map((point) =>
    rotateClockwise(
      scaleLocalPoint(point, input.widthFt, input.lengthFt),
      input.rotationDeg,
    ),
  );
}

export function getRotatedCabnEdges(input: {
  widthFt: number;
  lengthFt: number;
  rotationDeg: number;
}): PreviewEdge[] {
  return LOCAL_EDGES.map((edge) => {
    const start = rotateClockwise(
      scaleLocalPoint(edge.start, input.widthFt, input.lengthFt),
      input.rotationDeg,
    );
    const end = rotateClockwise(
      scaleLocalPoint(edge.end, input.widthFt, input.lengthFt),
      input.rotationDeg,
    );
    const outwardNormal = rotateClockwise(edge.outwardNormal, input.rotationDeg);

    return {
      id: edge.id,
      start,
      end,
      midpoint: midpoint(start, end),
      outwardNormal,
    };
  });
}

export function getEdgeFacingWall(input: {
  wall: CABNWall;
  widthFt: number;
  lengthFt: number;
  rotationDeg: number;
}): PreviewEdge {
  const desired = CARDINAL_VECTORS[input.wall];
  const edges = getRotatedCabnEdges(input);

  return edges.reduce((best, edge) =>
    dot(edge.outwardNormal, desired) > dot(best.outwardNormal, desired)
      ? edge
      : best,
  );
}

export function edgeSegment(edge: PreviewEdge, startRatio = 0.25, endRatio = 0.75) {
  return {
    start: {
      x: edge.start.x + (edge.end.x - edge.start.x) * startRatio,
      y: edge.start.y + (edge.end.y - edge.start.y) * startRatio,
    },
    end: {
      x: edge.start.x + (edge.end.x - edge.start.x) * endRatio,
      y: edge.start.y + (edge.end.y - edge.start.y) * endRatio,
    },
  };
}

export function pointOnEdge(edge: PreviewEdge, ratio: number): PreviewPoint {
  return {
    x: edge.start.x + (edge.end.x - edge.start.x) * ratio,
    y: edge.start.y + (edge.end.y - edge.start.y) * ratio,
  };
}

export function pointInsideFromEdge(edge: PreviewEdge, distanceFt: number) {
  return {
    x: edge.midpoint.x - edge.outwardNormal.x * distanceFt,
    y: edge.midpoint.y - edge.outwardNormal.y * distanceFt,
  };
}

function sortedItemsOnWall(items: CabnInteriorItem[], wall: CABNWall) {
  return items
    .filter((item) => item.wall === wall)
    .sort(
      (a, b) =>
        INTERIOR_ITEM_ORDER.indexOf(a.id) - INTERIOR_ITEM_ORDER.indexOf(b.id),
    );
}

function ratioForWallSlot(
  itemType: CabnInteriorItemId,
  wallItems: CabnInteriorItem[],
) {
  if (!wallItems.length) return DEFAULT_ITEM_RATIOS[itemType];

  const index = Math.max(
    0,
    wallItems.findIndex((item) => item.id === itemType),
  );
  if (wallItems.length === 1) {
    return DEFAULT_ITEM_RATIOS[itemType];
  }

  const usableSpan = 0.68;
  const start = (1 - usableSpan) / 2;

  return start + (usableSpan * index) / (wallItems.length - 1);
}

export function getWallAnchor(input: {
  wall: CABNWall;
  itemType: CabnInteriorItemId;
  widthFt: number;
  lengthFt: number;
  rotationDeg: number;
  items?: CabnInteriorItem[];
}): WallAnchor {
  const edge = getEdgeFacingWall(input);
  const wallItems = sortedItemsOnWall(input.items ?? [], input.wall);
  const wallIndex = Math.max(
    0,
    wallItems.findIndex((item) => item.id === input.itemType),
  );
  const laneOffsetFt =
    wallItems.length > 1 ? (wallIndex - (wallItems.length - 1) / 2) * 8 : 0;
  const edgeRatio = ratioForWallSlot(input.itemType, wallItems);
  const tangent = normalize({
    x: edge.end.x - edge.start.x,
    y: edge.end.y - edge.start.y,
  });
  const markerPoint = pointOnEdge(edge, edgeRatio);
  const labelDistanceFt = 12 + Math.max(0, wallItems.length - 1) * 1.5;

  return {
    itemId: input.itemType,
    wall: input.wall,
    edge,
    markerPoint,
    insidePoint: {
      x: markerPoint.x - edge.outwardNormal.x * 4,
      y: markerPoint.y - edge.outwardNormal.y * 4,
    },
    labelPoint: {
      x:
        markerPoint.x +
        edge.outwardNormal.x * labelDistanceFt +
        tangent.x * laneOffsetFt,
      y:
        markerPoint.y +
        edge.outwardNormal.y * labelDistanceFt +
        tangent.y * laneOffsetFt,
    },
    leaderBendPoint: {
      x: markerPoint.x + edge.outwardNormal.x * 5.5,
      y: markerPoint.y + edge.outwardNormal.y * 5.5,
    },
    edgeRatio,
    tangent,
  };
}
