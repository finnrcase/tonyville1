import {
  edgeSegment,
  getRotatedCabnCorners,
  getRotatedCabnEdges,
  getWallAnchor,
  pointOnEdge,
  type CabnInteriorItem,
  type CabnInteriorItemId,
  type PreviewEdge,
  type PreviewPoint,
  type WallAnchor,
} from "@/lib/cabnCustomization";
import type { CABNModel } from "@/lib/cabnModels";
import type {
  CABNCustomization,
  CABNWall,
  RoomPlacement,
  SelectedRoomPlan,
} from "@/lib/placeRoom";

type Cabn3DPreviewProps = {
  plan: SelectedRoomPlan;
  model: CABNModel;
  placement: RoomPlacement;
  customization: CABNCustomization;
  placementInferred?: boolean;
};

type ScreenPoint = PreviewPoint;

const VIEW_WIDTH = 1180;
const VIEW_HEIGHT = 720;
const ROOM_CENTER = { x: 590, y: 376 };
const SCALE = 21;
const Y_PERSPECTIVE = 0.72;
const WALL_THICKNESS_FT = 1.25;

const ITEM_STYLES: Record<
  CabnInteriorItemId,
  {
    label: string;
    width: number;
  }
> = {
  window: { label: "WINDOW", width: 106 },
  door: { label: "DOOR", width: 96 },
  desk: { label: "DESK", width: 96 },
  builtins: { label: "BUILT-INS", width: 116 },
};

function wallLabel(wall: CABNWall) {
  return `${wall[0].toUpperCase()}${wall.slice(1)} wall`;
}

function toScreen(point: PreviewPoint): ScreenPoint {
  return {
    x: ROOM_CENTER.x + point.x * SCALE,
    y: ROOM_CENTER.y + point.y * SCALE * Y_PERSPECTIVE,
  };
}

function pointsAttribute(points: ScreenPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function edgeAngle(edge: PreviewEdge) {
  const start = toScreen(edge.start);
  const end = toScreen(edge.end);

  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
}

function wallStrip(edge: PreviewEdge) {
  const outerStart = {
    x: edge.start.x + edge.outwardNormal.x * WALL_THICKNESS_FT,
    y: edge.start.y + edge.outwardNormal.y * WALL_THICKNESS_FT,
  };
  const outerEnd = {
    x: edge.end.x + edge.outwardNormal.x * WALL_THICKNESS_FT,
    y: edge.end.y + edge.outwardNormal.y * WALL_THICKNESS_FT,
  };

  return [edge.start, edge.end, outerEnd, outerStart].map(toScreen);
}

function roomRect(input: {
  widthFt: number;
  lengthFt: number;
  rotationDeg: number;
  expandWidthFt?: number;
  expandLengthFt?: number;
}) {
  return getRotatedCabnCorners({
    widthFt: input.widthFt + (input.expandWidthFt ?? 0),
    lengthFt: input.lengthFt + (input.expandLengthFt ?? 0),
    rotationDeg: input.rotationDeg,
  }).map(toScreen);
}

function segmentAround(edge: PreviewEdge, ratio: number, span = 0.28) {
  const half = span / 2;
  return edgeSegment(
    edge,
    Math.max(0.06, ratio - half),
    Math.min(0.94, ratio + half),
  );
}

function clampLabel(point: ScreenPoint, width: number) {
  return {
    x: Math.min(VIEW_WIDTH - width / 2 - 18, Math.max(width / 2 + 18, point.x)),
    y: Math.min(VIEW_HEIGHT - 78, Math.max(62, point.y)),
  };
}

function renderCallout(anchor: WallAnchor, item: CabnInteriorItem) {
  const labelWidth = ITEM_STYLES[item.id].width;
  const label = clampLabel(toScreen(anchor.labelPoint), labelWidth);
  const marker = toScreen(anchor.markerPoint);
  const bend = toScreen(anchor.leaderBendPoint);

  return (
    <g key={`callout-${item.id}`}>
      <path
        d={`M ${marker.x} ${marker.y} L ${bend.x} ${bend.y} L ${label.x} ${label.y}`}
        fill="none"
        stroke="#fffefd"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={marker.x} cy={marker.y} r="3.5" fill="#fffefd" />
      <rect
        x={label.x - labelWidth / 2}
        y={label.y - 27}
        width={labelWidth}
        height="58"
        rx="10"
        fill="#fffefd"
        stroke="rgba(28,30,27,0.08)"
        filter="url(#soft-shadow)"
      />
      <text
        x={label.x}
        y={label.y - 7}
        textAnchor="middle"
        className="fill-[#161817] text-[12px] font-bold"
      >
        {ITEM_STYLES[item.id].label}
      </text>
      <text
        x={label.x}
        y={label.y + 13}
        textAnchor="middle"
        className="fill-[#3f4741] text-[13px] font-medium"
      >
        {wallLabel(item.wall)}
      </text>
    </g>
  );
}

function lineFromSegment(
  segment: ReturnType<typeof edgeSegment>,
  className: string,
  stroke: string,
  strokeWidth: number,
) {
  const start = toScreen(segment.start);
  const end = toScreen(segment.end);

  return (
    <line
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      className={className}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  );
}

function renderDesk(anchor: WallAnchor) {
  const point = toScreen(anchor.insidePoint);

  return (
    <g transform={`translate(${point.x} ${point.y}) rotate(${edgeAngle(anchor.edge)})`}>
      <rect
        x="-34"
        y="-13"
        width="68"
        height="26"
        rx="5"
        fill="#d5b982"
        stroke="#987a48"
        strokeWidth="1.5"
      />
      <rect x="-22" y="-7" width="20" height="10" rx="2" fill="#f0e3c6" />
      <rect x="8" y="-7" width="16" height="10" rx="2" fill="#f0e3c6" />
      <circle cx="0" cy="28" r="12" fill="#d8d3c6" stroke="#afa793" />
    </g>
  );
}

function renderBuiltIns(anchor: WallAnchor) {
  const segment = segmentAround(anchor.edge, anchor.edgeRatio, 0.46);
  const start = toScreen(segment.start);
  const end = toScreen(segment.end);
  const angle = edgeAngle(anchor.edge);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const mid = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };

  return (
    <g transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`}>
      <rect
        x={-length / 2}
        y="-10"
        width={length}
        height="20"
        rx="4"
        fill="#d7c096"
        stroke="#8c7b5a"
        strokeWidth="1.5"
      />
      {[-0.33, 0, 0.33].map((offset) => (
        <line
          key={offset}
          x1={offset * length}
          y1="-9"
          x2={offset * length}
          y2="9"
          stroke="#a99672"
          strokeWidth="1"
        />
      ))}
    </g>
  );
}

function renderDoor(anchor: WallAnchor) {
  const segment = segmentAround(anchor.edge, anchor.edgeRatio, 0.22);

  return (
    <g>
      {lineFromSegment(segment, "", "#1f231f", 10)}
      {lineFromSegment(segment, "", "#315541", 4)}
    </g>
  );
}

function renderWindow(anchor: WallAnchor) {
  const segment = segmentAround(anchor.edge, anchor.edgeRatio, 0.38);

  return (
    <g>
      {lineFromSegment(segment, "", "#bce7ee", 11)}
      {lineFromSegment(segment, "", "#3192aa", 5)}
    </g>
  );
}

function renderYardStructure(plan: SelectedRoomPlan) {
  if (!plan.lot.structures?.length) return null;

  return (
    <g opacity="0.78">
      <rect
        x="96"
        y="92"
        width="176"
        height="112"
        rx="10"
        fill="#7d827b"
        stroke="#616962"
        strokeWidth="2"
      />
      <text
        x="184"
        y="223"
        textAnchor="middle"
        className="fill-[#f7f6f2] text-[12px] font-semibold"
      >
        Existing structure
      </text>
    </g>
  );
}

export function Cabn3DPreview({
  plan,
  model,
  placement,
  customization,
  placementInferred,
}: Cabn3DPreviewProps) {
  const roomInput = {
    widthFt: model.widthFt,
    lengthFt: model.lengthFt,
    rotationDeg: placement.rotationDeg,
  };
  const floorPoints = getRotatedCabnCorners(roomInput).map(toScreen);
  const floorClipPoints = pointsAttribute(floorPoints);
  const edges = getRotatedCabnEdges(roomInput);
  const items: CabnInteriorItem[] = [
    { id: "window", label: "Window", wall: customization.windowWall },
    { id: "door", label: "Door", wall: customization.doorWall },
    { id: "desk", label: "Desk", wall: customization.deskWall },
    { id: "builtins", label: "Built-ins", wall: customization.builtInsWall },
  ];
  const anchors = items.reduce<Record<CabnInteriorItemId, WallAnchor>>(
    (result, item) => ({
      ...result,
      [item.id]: getWallAnchor({
        wall: item.wall,
        itemType: item.id,
        items,
        ...roomInput,
      }),
    }),
    {} as Record<CabnInteriorItemId, WallAnchor>,
  );
  const patio = roomRect({
    ...roomInput,
    expandWidthFt: 13,
    expandLengthFt: 15,
  });
  const westPlant = toScreen(pointOnEdge(anchors.window.edge, 0.12));

  return (
    <div className="overflow-hidden rounded-[34px] border border-white/70 bg-[#e8e2d3] shadow-[0_30px_90px_rgba(22,24,23,0.13)]">
      <div className="relative min-h-[540px]">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          role="img"
          aria-label="Bird's-eye 3D preview of the selected CABN room customization"
          className="block h-full min-h-[540px] w-full"
        >
          <defs>
            <pattern id="grass-texture" width="56" height="56" patternUnits="userSpaceOnUse">
              <rect width="56" height="56" fill="#374622" />
              <path
                d="M8 46 C14 32 18 24 22 8 M30 54 C34 42 40 28 48 14 M2 18 C13 20 22 24 32 31 M40 48 C48 42 52 36 55 28"
                fill="none"
                stroke="#526538"
                strokeWidth="2"
                opacity="0.55"
              />
            </pattern>
            <pattern id="wood-floor" width="34" height="34" patternUnits="userSpaceOnUse">
              <rect width="34" height="34" fill="#d5aa73" />
              <path d="M0 8 H34 M0 25 H34" stroke="#b98450" strokeWidth="1" opacity="0.35" />
              <path d="M12 0 V34 M27 0 V34" stroke="#e3be88" strokeWidth="1" opacity="0.25" />
            </pattern>
            <filter id="soft-shadow" x="-35%" y="-35%" width="170%" height="170%">
              <feDropShadow dx="0" dy="12" stdDeviation="10" floodOpacity="0.18" />
            </filter>
            <filter id="room-shadow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="24" stdDeviation="18" floodOpacity="0.28" />
            </filter>
            <clipPath id="cabn-floor-clip">
              <polygon points={floorClipPoints} />
            </clipPath>
          </defs>

          <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#grass-texture)" />
          <path
            d="M0 92 C166 28 313 42 470 18 C650 -9 835 10 1180 0 L1180 150 C895 116 662 100 466 132 C310 158 140 164 0 220 Z"
            fill="#2c3722"
            opacity="0.72"
          />
          <path
            d="M30 78 L488 30"
            stroke="#6b4f31"
            strokeWidth="26"
            strokeLinecap="round"
            opacity="0.82"
          />
          <path
            d="M48 82 L506 34"
            stroke="#96704a"
            strokeWidth="3"
            strokeDasharray="24 14"
            opacity="0.65"
          />
          {renderYardStructure(plan)}

          <polygon
            points={pointsAttribute(patio)}
            fill="#bcb7aa"
            stroke="#cdc8bd"
            strokeWidth="4"
            filter="url(#soft-shadow)"
          />
          <path
            d={`M ${toScreen(anchors.door.markerPoint).x} ${toScreen(anchors.door.markerPoint).y} C 890 590, 980 620, 1128 690`}
            fill="none"
            stroke="#c8c3b6"
            strokeWidth="34"
            strokeLinecap="round"
            opacity="0.9"
          />
          <path
            d={`M ${toScreen(anchors.door.markerPoint).x} ${toScreen(anchors.door.markerPoint).y} C 890 590, 980 620, 1128 690`}
            fill="none"
            stroke="#9f9a8d"
            strokeWidth="2"
            strokeDasharray="22 18"
            opacity="0.9"
          />

          <g filter="url(#room-shadow)">
            <polygon
              points={floorClipPoints}
              fill="url(#wood-floor)"
              stroke="#8e7558"
              strokeWidth="2"
            />
            <g clipPath="url(#cabn-floor-clip)">
              {Array.from({ length: 9 }).map((_, index) => (
                <line
                  key={index}
                  x1="360"
                  y1={246 + index * 34}
                  x2="820"
                  y2={246 + index * 34}
                  stroke="#b9824f"
                  strokeWidth="1"
                  opacity="0.34"
                />
              ))}
            </g>

            {edges.map((edge, index) => (
              <polygon
                key={edge.id}
                points={pointsAttribute(wallStrip(edge))}
                fill={index % 2 === 0 ? "#f6f2e9" : "#ece6da"}
                stroke="#cfc8ba"
                strokeWidth="1.5"
              />
            ))}

            <polygon
              points={floorClipPoints}
              fill="none"
              stroke="#6f7069"
              strokeWidth="3"
              opacity="0.75"
            />

            {renderBuiltIns(anchors.builtins)}
            {renderDesk(anchors.desk)}
            {renderWindow(anchors.window)}
            {renderDoor(anchors.door)}

            <g transform={`translate(${westPlant.x - 42} ${westPlant.y + 18})`}>
              <circle r="12" fill="#596b3e" />
              <ellipse cx="-11" cy="-1" rx="16" ry="6" fill="#71894f" transform="rotate(-28)" />
              <ellipse cx="12" cy="-2" rx="16" ry="6" fill="#71894f" transform="rotate(31)" />
            </g>
          </g>

          {items.map((item) => renderCallout(anchors[item.id], item))}

          <g transform="translate(1110 84)">
            <text
              y="-40"
              textAnchor="middle"
              className="fill-[#fffefd] text-[16px] font-bold"
            >
              N
            </text>
            <circle r="34" fill="#fffefd" stroke="rgba(28,30,27,0.1)" strokeWidth="2" />
            <path d="M0 17 L0 -17" stroke="#22402f" strokeWidth="3" strokeLinecap="round" />
            <path
              d="M0 -17 L-8 -4 M0 -17 L8 -4"
              stroke="#22402f"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
        </svg>

        <div className="pointer-events-none absolute left-5 top-5 rounded-full border border-white/60 bg-white/82 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#475149] shadow-sm backdrop-blur">
          {placementInferred ? "Placement needs review" : "Property-aware preview"}
        </div>
      </div>

      <div className="border-t border-white/70 bg-[#fffefd]/92 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f0eee7] text-[#22402f]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M8.5 14.5c-1.4-1-2.3-2.7-2.3-4.5a5.8 5.8 0 0 1 11.6 0c0 1.8-.9 3.5-2.3 4.5-.8.6-1.5 1.4-1.5 2.5h-4c0-1.1-.7-1.9-1.5-2.5Z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1c1e1b]">
                Smart placement
              </div>
              <p className="mt-1 max-w-xl text-sm leading-6 text-[#66716a]">
                Your CABN is positioned for light, privacy, access, and yard
                flow based on the current property context.
              </p>
            </div>
          </div>
          <div className="rounded-full border border-[#e4e1d8] bg-white px-4 py-2 text-sm font-semibold text-[#56625c]">
            {Math.round(placement.rotationDeg)} degree rotation
          </div>
        </div>
      </div>
    </div>
  );
}
