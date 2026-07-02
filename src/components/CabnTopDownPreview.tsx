import {
  edgeSegment,
  getEdgeFacingWall,
  getRotatedCabnCorners,
  pointInsideFromEdge,
  type PreviewPoint,
} from "@/lib/cabnCustomization";
import type { CABNModel } from "@/lib/cabnModels";
import type {
  CABNCustomization,
  RoomPlacement,
  SelectedRoomPlan,
} from "@/lib/placeRoom";
import type { YardGeometry } from "@/lib/yardGeometry";

type CabnTopDownPreviewProps = {
  plan: SelectedRoomPlan;
  model: CABNModel;
  placement: RoomPlacement;
  customization: CABNCustomization;
  placementInferred?: boolean;
};

type ScreenPoint = PreviewPoint;

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 700;
const PADDING = 74;
const FEET_PER_DEGREE_LAT = 364000;

function feetPerDegreeLng(lat: number) {
  return Math.max(120000, Math.cos((lat * Math.PI) / 180) * FEET_PER_DEGREE_LAT);
}

function coordinateToFeet(
  coordinate: [number, number],
  center: { lat: number; lng: number },
): PreviewPoint {
  return {
    x: (coordinate[0] - center.lng) * feetPerDegreeLng(center.lat),
    y: (center.lat - coordinate[1]) * FEET_PER_DEGREE_LAT,
  };
}

function geometryRings(geometry?: YardGeometry): [number, number][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    return geometry.coordinates
      .filter((ring) => ring.length > 2)
      .map((ring) => ring as [number, number][]);
  }

  return geometry.coordinates.flatMap((polygon) =>
    polygon
      .filter((ring) => ring.length > 2)
      .map((ring) => ring as [number, number][]),
  );
}

function geometryToFeetPolygons(
  geometry: YardGeometry | undefined,
  center: { lat: number; lng: number },
) {
  return geometryRings(geometry).map((ring) =>
    ring.map((coordinate) => coordinateToFeet(coordinate, center)),
  );
}

function makeTransform(points: PreviewPoint[]) {
  const fallback = points.length
    ? points
    : [
        { x: -120, y: -90 },
        { x: 120, y: 90 },
      ];
  const xs = fallback.map((point) => point.x);
  const ys = fallback.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = Math.min(
    (VIEW_WIDTH - PADDING * 2) / width,
    (VIEW_HEIGHT - PADDING * 2) / height,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    scale,
    point(point: PreviewPoint): ScreenPoint {
      return {
        x: VIEW_WIDTH / 2 + (point.x - centerX) * scale,
        y: VIEW_HEIGHT / 2 + (point.y - centerY) * scale,
      };
    },
  };
}

function pointsAttribute(points: ScreenPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function wallText(wall: string) {
  return `${wall[0]?.toUpperCase()}${wall.slice(1)}`;
}

export function CabnTopDownPreview({
  plan,
  model,
  placement,
  customization,
  placementInferred,
}: CabnTopDownPreviewProps) {
  const center = {
    lat: placement.centerLat,
    lng: placement.centerLng,
  };
  const lotPolygons = geometryToFeetPolygons(plan.lot.boundary, center);
  const structurePolygons = (plan.lot.structures ?? []).flatMap((structure) =>
    geometryToFeetPolygons(structure.footprint, center),
  );
  const cabnInput = {
    widthFt: model.widthFt,
    lengthFt: model.lengthFt,
    rotationDeg: placement.rotationDeg,
  };
  const cabnCorners = getRotatedCabnCorners(cabnInput);
  const allPoints = [
    ...lotPolygons.flat(),
    ...structurePolygons.flat(),
    ...cabnCorners,
  ];
  const transform = makeTransform(allPoints);
  const cabnScreenCorners = cabnCorners.map(transform.point);
  const windowEdge = getEdgeFacingWall({
    wall: customization.windowWall,
    ...cabnInput,
  });
  const doorEdge = getEdgeFacingWall({
    wall: customization.doorWall,
    ...cabnInput,
  });
  const deskEdge = getEdgeFacingWall({
    wall: customization.deskWall,
    ...cabnInput,
  });
  const builtInsEdge = customization.builtInsWall
    ? getEdgeFacingWall({ wall: customization.builtInsWall, ...cabnInput })
    : null;
  const viewEdge = customization.majorViewWall
    ? getEdgeFacingWall({ wall: customization.majorViewWall, ...cabnInput })
    : null;
  const windowSegment = edgeSegment(windowEdge, 0.18, 0.82);
  const doorSegment = edgeSegment(doorEdge, 0.38, 0.62);
  const builtInsSegment = builtInsEdge ? edgeSegment(builtInsEdge, 0.18, 0.82) : null;
  const viewSegment = viewEdge ? edgeSegment(viewEdge, 0.08, 0.92) : null;
  const deskPoint = transform.point(pointInsideFromEdge(deskEdge, 5));
  const doorLabel = transform.point({
    x: doorEdge.midpoint.x + doorEdge.outwardNormal.x * 10,
    y: doorEdge.midpoint.y + doorEdge.outwardNormal.y * 10,
  });
  const windowLabel = transform.point({
    x: windowEdge.midpoint.x + windowEdge.outwardNormal.x * 10,
    y: windowEdge.midpoint.y + windowEdge.outwardNormal.y * 10,
  });

  return (
    <div className="relative flex min-h-[520px] overflow-hidden rounded-[36px] border border-white/80 bg-[#e8e5d8] shadow-[0_28px_90px_rgba(22,24,23,0.13)]">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="Top-down preview of selected CABN placement"
        className="h-full min-h-[520px] w-full"
      >
        <defs>
          <pattern
            id="yard-grid"
            width="42"
            height="42"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 42 0 L 0 0 0 42"
              fill="none"
              stroke="#d7d6c7"
              strokeWidth="1"
              opacity="0.45"
            />
          </pattern>
          <filter id="cabn-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="12" stdDeviation="12" floodOpacity="0.14" />
          </filter>
        </defs>

        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#e8e5d8" />
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#yard-grid)" />

        {lotPolygons.map((polygon, index) => (
          <polygon
            key={`lot-${index}`}
            points={pointsAttribute(polygon.map(transform.point))}
            fill="#dce9d7"
            stroke={plan.lot.boundaryIsEstimated ? "#a9b69d" : "#6f846f"}
            strokeDasharray={plan.lot.boundaryIsEstimated ? "12 10" : undefined}
            strokeWidth="4"
          />
        ))}

        {structurePolygons.map((polygon, index) => (
          <polygon
            key={`structure-${index}`}
            points={pointsAttribute(polygon.map(transform.point))}
            fill="#8f958f"
            opacity="0.68"
            stroke="#656d67"
            strokeWidth="2"
          />
        ))}

        {viewSegment ? (
          <line
            x1={transform.point(viewSegment.start).x}
            y1={transform.point(viewSegment.start).y}
            x2={transform.point(viewSegment.end).x}
            y2={transform.point(viewSegment.end).y}
            stroke="#d1a95f"
            strokeWidth="16"
            strokeLinecap="round"
            opacity="0.82"
          />
        ) : null}

        <polygon
          points={pointsAttribute(cabnScreenCorners)}
          fill="#fffefd"
          stroke="#203b2c"
          strokeWidth="5"
          filter="url(#cabn-shadow)"
        />

        <line
          x1={transform.point(windowSegment.start).x}
          y1={transform.point(windowSegment.start).y}
          x2={transform.point(windowSegment.end).x}
          y2={transform.point(windowSegment.end).y}
          stroke="#5ba3bc"
          strokeWidth="8"
          strokeLinecap="round"
        />

        <line
          x1={transform.point(doorSegment.start).x}
          y1={transform.point(doorSegment.start).y}
          x2={transform.point(doorSegment.end).x}
          y2={transform.point(doorSegment.end).y}
          stroke="#203b2c"
          strokeWidth="11"
          strokeLinecap="round"
        />

        {builtInsSegment ? (
          <line
            x1={transform.point(builtInsSegment.start).x}
            y1={transform.point(builtInsSegment.start).y}
            x2={transform.point(builtInsSegment.end).x}
            y2={transform.point(builtInsSegment.end).y}
            stroke="#7e857e"
            strokeWidth="6"
            strokeDasharray="8 7"
            strokeLinecap="round"
          />
        ) : null}

        <rect
          x={deskPoint.x - 20}
          y={deskPoint.y - 8}
          width="40"
          height="16"
          rx="5"
          fill="#d9c6a5"
          stroke="#8a7a60"
          strokeWidth="2"
        />

        <text
          x={windowLabel.x}
          y={windowLabel.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-[#2b6f83] text-[18px] font-semibold"
        >
          Window · {wallText(customization.windowWall)}
        </text>
        <text
          x={doorLabel.x}
          y={doorLabel.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-[#203b2c] text-[18px] font-semibold"
        >
          Door · {wallText(customization.doorWall)}
        </text>
        <text
          x={deskPoint.x}
          y={deskPoint.y + 34}
          textAnchor="middle"
          className="fill-[#6e6048] text-[16px] font-semibold"
        >
          Desk · {wallText(customization.deskWall)}
        </text>

        <g transform="translate(926 74)">
          <circle r="34" fill="#fffefd" stroke="#d9ded7" strokeWidth="2" />
          <path d="M0 17 L0 -17" stroke="#203b2c" strokeWidth="3" strokeLinecap="round" />
          <path d="M0 -17 L-7 -5 M0 -17 L7 -5" stroke="#203b2c" strokeWidth="3" strokeLinecap="round" />
          <text
            y="-44"
            textAnchor="middle"
            className="fill-[#203b2c] text-[18px] font-semibold"
          >
            N
          </text>
        </g>
      </svg>

      <div className="pointer-events-none absolute left-5 top-5 rounded-full border border-white/75 bg-white/88 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#5d665f] shadow-sm backdrop-blur">
        {placementInferred ? "Placement needs review" : "Property orientation preview"}
      </div>
      <div className="pointer-events-none absolute bottom-5 left-5 rounded-2xl border border-white/75 bg-white/86 px-4 py-3 text-sm font-semibold text-[#27302b] shadow-sm backdrop-blur">
        North is based on your property orientation.
      </div>
    </div>
  );
}
