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

const CARDINAL_VECTORS: Record<CABNWall, PreviewPoint> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
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

export function pointInsideFromEdge(edge: PreviewEdge, distanceFt: number) {
  return {
    x: edge.midpoint.x - edge.outwardNormal.x * distanceFt,
    y: edge.midpoint.y - edge.outwardNormal.y * distanceFt,
  };
}
