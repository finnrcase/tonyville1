import type { ReactNode } from "react";
import { Home } from "lucide-react";
import {
  computeInteriorLayout,
  wallLengthFt,
  type InteriorItemId,
  type InteriorItemPlacement,
  type InteriorLayout,
  type RoomDimensions,
} from "@/lib/cabnInteriorLayout";
import type { CABNModel } from "@/lib/cabnModels";
import type { CABNCustomization, CABNWall } from "@/lib/placeRoom";

type CabnInteriorPreviewProps = {
  model: CABNModel;
  customization: CABNCustomization;
  placementInferred?: boolean;
  /** Staged-flow mode: fills its container without a minimum height or footer. */
  compact?: boolean;
};

/**
 * Rendering layer for the Edit Your CABN configurator: a roofless isometric
 * bird's-eye view of the room interior, drawn from the placements produced by
 * `computeInteriorLayout`. Swapping this component for a Three.js scene later
 * only requires consuming the same layout output.
 */

type P3 = { e: number; s: number; u: number };
type Pt = { x: number; y: number };

const VIEW_W = 1180;
const VIEW_H = 780;
const CX = 590;
const CY = 462;

const WALL_H = 7.5;
const STUB_H = 1.15;
const WALL_T = 0.55;
const DOOR_H = 6.8;
const WIN_SILL = 0.75;
const WIN_HEAD = 6.85;
const SLAB_D = 0.7;

/** Back walls are drawn full height; front walls are cut down so the eye can enter the room. */
const BACK_WALLS: CABNWall[] = ["west", "north"];
const FRONT_WALLS: CABNWall[] = ["east", "south"];

type Geometry = {
  W: number;
  L: number;
  isoX: number;
  isoY: number;
  upPx: number;
  project: (p: P3) => Pt;
  pts: (points: P3[]) => string;
  wallPoint: (wall: CABNWall, tFt: number, u: number) => P3;
  wallLen: (wall: CABNWall) => number;
};

const WALL_INWARD: Record<CABNWall, { e: number; s: number }> = {
  north: { e: 0, s: 1 },
  south: { e: 0, s: -1 },
  west: { e: 1, s: 0 },
  east: { e: -1, s: 0 },
};

const WALL_DISPLAY: Record<CABNWall, string> = {
  north: "North Wall",
  east: "East Wall",
  south: "South Wall",
  west: "West Wall",
};

const ITEM_DISPLAY: Record<InteriorItemId, string> = {
  window: "Window",
  door: "Door",
  desk: "Desk",
  builtins: "Built-ins",
};

const CALLOUT_SLOTS: Record<
  InteriorItemId,
  { x: number; y: number; side: "left" | "right" }
> = {
  window: { x: 150, y: 138, side: "left" },
  builtins: { x: 150, y: 646, side: "left" },
  door: { x: 1030, y: 208, side: "right" },
  desk: { x: 1030, y: 646, side: "right" },
};

function createGeometry(room: RoomDimensions): Geometry {
  const W = room.widthFt;
  const L = room.lengthFt;
  const unit = Math.min(29, 800 / (W + L));
  const isoX = unit;
  const isoY = unit * 0.5;
  const upPx = unit * 0.8;

  const project = ({ e, s, u }: P3): Pt => ({
    x: CX + (e - s) * isoX,
    y: CY + (e + s) * isoY - u * upPx,
  });

  const pts = (points: P3[]) =>
    points
      .map(project)
      .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(" ");

  const wallPoint = (wall: CABNWall, tFt: number, u: number): P3 => {
    switch (wall) {
      case "north":
        return { e: -W / 2 + tFt, s: -L / 2, u };
      case "south":
        return { e: -W / 2 + tFt, s: L / 2, u };
      case "west":
        return { e: -W / 2, s: -L / 2 + tFt, u };
      case "east":
        return { e: W / 2, s: -L / 2 + tFt, u };
    }
  };

  return {
    W,
    L,
    isoX,
    isoY,
    upPx,
    project,
    pts,
    wallPoint,
    wallLen: (wall) => wallLengthFt(wall, room),
  };
}

function shift(point: P3, dir: { e: number; s: number }, distance: number): P3 {
  return {
    e: point.e + dir.e * distance,
    s: point.s + dir.s * distance,
    u: point.u,
  };
}

/** Axis-aligned box in room space: top + the two viewer-facing sides. */
function isoBox(
  g: Geometry,
  center: { e: number; s: number },
  halfE: number,
  halfS: number,
  u0: number,
  u1: number,
  fills: { top: string; south: string; east: string },
  stroke?: string,
) {
  const { e, s } = center;
  const face = (points: P3[], fill: string) => (
    <polygon
      points={g.pts(points)}
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke ? 1 : 0}
      strokeLinejoin="round"
    />
  );

  return (
    <>
      {face(
        [
          { e: e + halfE, s: s - halfS, u: u0 },
          { e: e + halfE, s: s + halfS, u: u0 },
          { e: e + halfE, s: s + halfS, u: u1 },
          { e: e + halfE, s: s - halfS, u: u1 },
        ],
        fills.east,
      )}
      {face(
        [
          { e: e - halfE, s: s + halfS, u: u0 },
          { e: e + halfE, s: s + halfS, u: u0 },
          { e: e + halfE, s: s + halfS, u: u1 },
          { e: e - halfE, s: s + halfS, u: u1 },
        ],
        fills.south,
      )}
      {face(
        [
          { e: e - halfE, s: s - halfS, u: u1 },
          { e: e + halfE, s: s - halfS, u: u1 },
          { e: e + halfE, s: s + halfS, u: u1 },
          { e: e - halfE, s: s + halfS, u: u1 },
        ],
        fills.top,
      )}
    </>
  );
}

function groundEllipse(
  g: Geometry,
  center: { e: number; s: number },
  radiusFt: number,
  fill: string,
  opacity = 1,
) {
  const at = g.project({ ...center, u: 0 });
  return (
    <ellipse
      cx={at.x}
      cy={at.y}
      rx={radiusFt * 1.414 * g.isoX}
      ry={radiusFt * 1.414 * g.isoY}
      fill={fill}
      opacity={opacity}
    />
  );
}

function itemCenterOnFloor(
  g: Geometry,
  placement: InteriorItemPlacement,
  depthFt: number,
) {
  const inward = WALL_INWARD[placement.wall];
  const base = g.wallPoint(
    placement.wall,
    placement.ratio * g.wallLen(placement.wall),
    0,
  );
  const center = shift(base, inward, 0.15 + depthFt / 2);
  const halfAlong = placement.widthFt / 2;
  const acrossWidth =
    placement.wall === "north" || placement.wall === "south";
  return {
    center,
    halfE: acrossWidth ? halfAlong : depthFt / 2,
    halfS: acrossWidth ? depthFt / 2 : halfAlong,
    inward,
  };
}

function renderDesk(g: Geometry, placement: InteriorItemPlacement) {
  const depth = 2;
  const { center, halfE, halfS, inward } = itemCenterOnFloor(g, placement, depth);
  const alongIsE = halfE > halfS;
  const panelInset = 0.2;

  const panelBox = (sign: 1 | -1) => {
    const offset = (alongIsE ? halfE : halfS) - panelInset;
    const panelCenter = {
      e: center.e + (alongIsE ? sign * offset : 0),
      s: center.s + (alongIsE ? 0 : sign * offset),
    };
    return isoBox(
      g,
      panelCenter,
      alongIsE ? 0.09 : halfE - 0.12,
      alongIsE ? halfS - 0.12 : 0.09,
      0,
      2.3,
      { top: "#b58a55", south: "#ad8250", east: "#9d7343" },
    );
  };

  const chairCenter = shift(center, inward, depth / 2 + 1.2);
  const chairSeat = g.project({ ...chairCenter, u: 1.35 });
  const chairBase = g.project({ ...chairCenter, u: 0 });
  const backrestCenter = shift(chairCenter, inward, 0.75);

  const chair = (
    <g>
      {groundEllipse(g, chairCenter, 0.95, "rgba(40,42,38,0.12)")}
      <line
        x1={chairBase.x}
        y1={chairBase.y}
        x2={chairSeat.x}
        y2={chairSeat.y}
        stroke="#a49d8d"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <ellipse
        cx={chairSeat.x}
        cy={chairSeat.y}
        rx={0.85 * 1.414 * g.isoX}
        ry={0.85 * 1.414 * g.isoY}
        fill="#ece8de"
        stroke="#c9c2b1"
        strokeWidth={1.2}
      />
      {isoBox(
        g,
        backrestCenter,
        Math.abs(inward.e) > 0 ? 0.12 : 0.8,
        Math.abs(inward.e) > 0 ? 0.8 : 0.12,
        1.35,
        2.7,
        { top: "#e5e0d4", south: "#ddd7c9", east: "#cfc8b8" },
      )}
    </g>
  );

  const chairFirst = placement.wall === "south" || placement.wall === "east";

  return (
    <g>
      {groundEllipse(
        g,
        center,
        Math.max(halfE, halfS) * 0.9,
        "rgba(40,42,38,0.13)",
      )}
      {chairFirst ? chair : null}
      {panelBox(-1)}
      {panelBox(1)}
      {isoBox(g, center, halfE, halfS, 2.3, 2.48, {
        top: "#d6ae79",
        south: "#c89d68",
        east: "#b78c55",
      })}
      {chairFirst ? null : chair}
    </g>
  );
}

function renderBuiltIns(g: Geometry, placement: InteriorItemPlacement) {
  const depth = 1.85;
  const { center, halfE, halfS } = itemCenterOnFloor(g, placement, depth);
  const alongIsE = halfE > halfS;
  const showSeams = placement.wall === "north" || placement.wall === "west";
  const along = alongIsE ? halfE : halfS;
  const seamCount = Math.max(2, Math.round((along * 2) / 1.6));
  const seams = showSeams
    ? Array.from({ length: seamCount - 1 }, (_, index) => {
        const offset = -along + ((index + 1) * (along * 2)) / seamCount;
        const seamBase = {
          e: center.e + (alongIsE ? offset : halfE),
          s: center.s + (alongIsE ? halfS : offset),
        };
        const bottom = g.project({ ...seamBase, u: 0.18 });
        const top = g.project({ ...seamBase, u: 2.55 });
        return (
          <line
            key={index}
            x1={bottom.x}
            y1={bottom.y}
            x2={top.x}
            y2={top.y}
            stroke="#a98f63"
            strokeWidth={1}
            opacity={0.65}
          />
        );
      })
    : null;

  return (
    <g>
      {groundEllipse(
        g,
        center,
        Math.max(halfE, halfS) * 0.85,
        "rgba(40,42,38,0.12)",
      )}
      {isoBox(g, center, halfE, halfS, 0, 2.75, {
        top: "#e2d5ba",
        south: "#d6c19a",
        east: "#c5ac82",
      })}
      {seams}
      {isoBox(g, center, halfE + 0.08, halfS + 0.08, 2.75, 2.95, {
        top: "#efe5d1",
        south: "#e2d6bd",
        east: "#d3c4a6",
      })}
    </g>
  );
}

function renderPlant(g: Geometry, corner: { e: number; s: number }) {
  const top = g.project({ ...corner, u: 0.95 });
  const leaves = [-64, -20, 24, 66].map((angle, index) => (
    <ellipse
      key={angle}
      cx={top.x}
      cy={top.y - 8}
      rx={16}
      ry={5.5}
      fill={index % 2 === 0 ? "#5f7a4a" : "#74915c"}
      transform={`rotate(${angle} ${top.x} ${top.y - 8})`}
    />
  ));

  return (
    <g>
      {groundEllipse(g, corner, 0.75, "rgba(40,42,38,0.12)")}
      {isoBox(g, corner, 0.42, 0.42, 0, 0.95, {
        top: "#d4cdbd",
        south: "#c6bead",
        east: "#b6ad9a",
      })}
      {leaves}
    </g>
  );
}

function renderWindowOnBackWall(g: Geometry, placement: InteriorItemPlacement) {
  const len = g.wallLen(placement.wall);
  const t0 = placement.ratio * len - placement.widthFt / 2;
  const t1 = placement.ratio * len + placement.widthFt / 2;
  const wp = (t: number, u: number) => g.wallPoint(placement.wall, t, u);
  const mullion =
    placement.widthFt >= 4
      ? (() => {
          const bottom = g.project(wp((t0 + t1) / 2, WIN_SILL));
          const top = g.project(wp((t0 + t1) / 2, WIN_HEAD));
          return (
            <line
              x1={bottom.x}
              y1={bottom.y}
              x2={top.x}
              y2={top.y}
              stroke="#3f453f"
              strokeWidth={1.6}
            />
          );
        })()
      : null;

  return (
    <g>
      <polygon
        points={g.pts([
          wp(t0 - 0.15, WIN_SILL - 0.14),
          wp(t1 + 0.15, WIN_SILL - 0.14),
          wp(t1 + 0.15, WIN_SILL),
          wp(t0 - 0.15, WIN_SILL),
        ])}
        fill="#efe9db"
        stroke="#d8d1c0"
        strokeWidth={1}
      />
      <polygon
        points={g.pts([
          wp(t0, WIN_SILL),
          wp(t1, WIN_SILL),
          wp(t1, WIN_HEAD),
          wp(t0, WIN_HEAD),
        ])}
        fill="url(#cabn-glass)"
        stroke="#3f453f"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <polygon
        points={g.pts([
          wp(t0 + 0.25, WIN_HEAD - 0.35),
          wp(t0 + placement.widthFt * 0.42, WIN_HEAD - 0.35),
          wp(t0 + placement.widthFt * 0.16, WIN_SILL + 0.4),
          wp(t0 + 0.25, WIN_SILL + 0.9),
        ])}
        fill="#ffffff"
        opacity={0.22}
      />
      {mullion}
    </g>
  );
}

function renderDoorLeafAndSwing(
  g: Geometry,
  placement: InteriorItemPlacement,
  withFrame = false,
) {
  const wall = placement.wall;
  const len = g.wallLen(wall);
  const t0 = placement.ratio * len - placement.widthFt / 2;
  const t1 = placement.ratio * len + placement.widthFt / 2;
  const width = t1 - t0;
  const inward = WALL_INWARD[wall];
  const along = {
    e: (g.wallPoint(wall, 1, 0).e - g.wallPoint(wall, 0, 0).e) || 0,
    s: (g.wallPoint(wall, 1, 0).s - g.wallPoint(wall, 0, 0).s) || 0,
  };
  const swing = (38 * Math.PI) / 180;
  const hinge = g.wallPoint(wall, t0, 0);
  const leafEnd: P3 = {
    e: hinge.e + along.e * Math.cos(swing) * width + inward.e * Math.sin(swing) * width,
    s: hinge.s + along.s * Math.cos(swing) * width + inward.s * Math.sin(swing) * width,
    u: 0,
  };
  const control: P3 = {
    e: hinge.e + along.e * Math.cos(swing / 2) * width * 1.06 + inward.e * Math.sin(swing / 2) * width * 1.06,
    s: hinge.s + along.s * Math.cos(swing / 2) * width * 1.06 + inward.s * Math.sin(swing / 2) * width * 1.06,
    u: 0,
  };
  const arcStart = g.project(g.wallPoint(wall, t1, 0));
  const arcControl = g.project(control);
  const arcEnd = g.project(leafEnd);
  const handle = g.project({
    e: hinge.e + (leafEnd.e - hinge.e) * 0.9,
    s: hinge.s + (leafEnd.s - hinge.s) * 0.9,
    u: 3.2,
  });

  const framePost = (t: number) => (
    <polygon
      points={g.pts([
        g.wallPoint(wall, t - 0.12, 0),
        g.wallPoint(wall, t + 0.12, 0),
        g.wallPoint(wall, t + 0.12, DOOR_H + 0.25),
        g.wallPoint(wall, t - 0.12, DOOR_H + 0.25),
      ])}
      fill="#efeadd"
      stroke="#c9c1ad"
      strokeWidth={1}
      strokeLinejoin="round"
    />
  );

  return (
    <g>
      {withFrame ? (
        <>
          {framePost(t0)}
          {framePost(t1)}
          <polygon
            points={g.pts([
              g.wallPoint(wall, t0 - 0.12, DOOR_H),
              g.wallPoint(wall, t1 + 0.12, DOOR_H),
              g.wallPoint(wall, t1 + 0.12, DOOR_H + 0.25),
              g.wallPoint(wall, t0 - 0.12, DOOR_H + 0.25),
            ])}
            fill="#efeadd"
            stroke="#c9c1ad"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </>
      ) : null}
      <path
        d={`M ${arcStart.x} ${arcStart.y} Q ${arcControl.x} ${arcControl.y} ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        stroke="#b4ae9e"
        strokeWidth={1.4}
        strokeDasharray="5 4"
      />
      <polygon
        points={g.pts([
          hinge,
          leafEnd,
          { ...leafEnd, u: DOOR_H },
          { ...hinge, u: DOOR_H },
        ])}
        fill="#b98d5e"
        stroke="#96703f"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <circle cx={handle.x} cy={handle.y} r={2.4} fill="#4c4436" />
    </g>
  );
}

function renderDoorOnBackWall(g: Geometry, placement: InteriorItemPlacement) {
  const len = g.wallLen(placement.wall);
  const t0 = placement.ratio * len - placement.widthFt / 2;
  const t1 = placement.ratio * len + placement.widthFt / 2;
  const wp = (t: number, u: number) => g.wallPoint(placement.wall, t, u);

  return (
    <g>
      <polygon
        points={g.pts([wp(t0, 0), wp(t1, 0), wp(t1, DOOR_H), wp(t0, DOOR_H)])}
        fill="url(#cabn-doorway)"
        stroke="#a79d89"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {renderDoorLeafAndSwing(g, placement)}
    </g>
  );
}

function renderBackWall(
  g: Geometry,
  wall: CABNWall,
  layout: InteriorLayout,
) {
  const len = g.wallLen(wall);
  const inward = WALL_INWARD[wall];
  const out = { e: -inward.e, s: -inward.s };
  const wp = (t: number, u: number) => g.wallPoint(wall, t, u);
  const wpOut = (t: number, u: number) => ({ ...shift(wp(t, u), out, WALL_T), u });
  const topStart = wall === "north" ? -WALL_T : 0;
  const window = layout.window.wall === wall ? layout.window : null;
  const door = layout.door.wall === wall ? layout.door : null;

  return (
    <g>
      <polygon
        points={g.pts([wp(0, 0), wp(len, 0), wp(len, WALL_H), wp(0, WALL_H)])}
        fill="url(#cabn-wall-face)"
      />
      <polygon
        points={g.pts([wp(0, 0), wp(len, 0), wp(len, 0.4), wp(0, 0.4)])}
        fill="#eae4d6"
        opacity={0.85}
      />
      {window ? (
        <g key={`window-${wall}`} className="cabn-item-in">
          {renderWindowOnBackWall(g, window)}
        </g>
      ) : null}
      {door ? (
        <g key={`door-${wall}`} className="cabn-item-in">
          {renderDoorOnBackWall(g, door)}
        </g>
      ) : null}
      <polygon
        points={g.pts([
          wp(topStart, WALL_H),
          wp(len, WALL_H),
          wpOut(len, WALL_H),
          wpOut(topStart, WALL_H),
        ])}
        fill="#fbf9f3"
        stroke="#e3ddcd"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <polygon
        points={g.pts([wp(len, 0), wpOut(len, 0), wpOut(len, WALL_H), wp(len, WALL_H)])}
        fill="#e7e1d3"
        stroke="#d9d2c0"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </g>
  );
}

function renderFrontWall(
  g: Geometry,
  wall: CABNWall,
  layout: InteriorLayout,
) {
  const len = g.wallLen(wall);
  const inward = WALL_INWARD[wall];
  const out = { e: -inward.e, s: -inward.s };
  const wp = (t: number, u: number) => g.wallPoint(wall, t, u);
  const wpOut = (t: number, u: number) => ({ ...shift(wp(t, u), out, WALL_T), u });

  const gaps: Array<{ from: number; to: number }> = [];
  for (const id of ["door", "window"] as InteriorItemId[]) {
    const placement = layout[id];
    if (placement.wall !== wall) continue;
    gaps.push({
      from: placement.ratio * len - placement.widthFt / 2,
      to: placement.ratio * len + placement.widthFt / 2,
    });
  }
  gaps.sort((a, b) => a.from - b.from);

  const runs: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  for (const gap of gaps) {
    if (gap.from - cursor > 0.05) runs.push({ from: cursor, to: gap.from });
    cursor = Math.max(cursor, gap.to);
  }
  if (len - cursor > 0.05) runs.push({ from: cursor, to: len });

  const door = layout.door.wall === wall ? layout.door : null;
  const doorGap = door
    ? {
        from: door.ratio * len - door.widthFt / 2,
        to: door.ratio * len + door.widthFt / 2,
      }
    : null;

  return (
    <g>
      {doorGap ? (
        <polygon
          points={g.pts([
            wp(doorGap.from, 0.02),
            wp(doorGap.to, 0.02),
            wpOut(doorGap.to, 0.02),
            wpOut(doorGap.from, 0.02),
          ])}
          fill="#d9d2c1"
        />
      ) : null}
      {runs.map((run) => (
        <g key={`${wall}-${run.from.toFixed(2)}`}>
          <polygon
            points={g.pts([
              wpOut(run.from, 0),
              wpOut(run.to, 0),
              wpOut(run.to, STUB_H),
              wpOut(run.from, STUB_H),
            ])}
            fill="#ddd6c6"
          />
          <polygon
            points={g.pts([
              wp(run.to, 0),
              wpOut(run.to, 0),
              wpOut(run.to, STUB_H),
              wp(run.to, STUB_H),
            ])}
            fill="#cfc7b5"
          />
          <polygon
            points={g.pts([
              wp(run.from, STUB_H),
              wp(run.to, STUB_H),
              wpOut(run.to, STUB_H),
              wpOut(run.from, STUB_H),
            ])}
            fill="#f6f3ea"
            stroke="#e6dfcf"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </g>
      ))}
    </g>
  );
}

function renderFrontGlass(g: Geometry, placement: InteriorItemPlacement) {
  const len = g.wallLen(placement.wall);
  const t0 = placement.ratio * len - placement.widthFt / 2;
  const t1 = placement.ratio * len + placement.widthFt / 2;
  const wp = (t: number, u: number) => g.wallPoint(placement.wall, t, u);

  return (
    <g>
      <polygon
        points={g.pts([wp(t0, 0), wp(t1, 0), wp(t1, WIN_HEAD), wp(t0, WIN_HEAD)])}
        fill="#cfe4e6"
        opacity={0.18}
      />
      <polygon
        points={g.pts([wp(t0, 0), wp(t1, 0), wp(t1, WIN_HEAD), wp(t0, WIN_HEAD)])}
        fill="none"
        stroke="#4a4f48"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <polygon
        points={g.pts([wp(t0, 0.18), wp(t1, 0.18), wp(t1, 0.02), wp(t0, 0.02)])}
        fill="#4a4f48"
        opacity={0.55}
      />
    </g>
  );
}

function calloutTarget(
  g: Geometry,
  id: InteriorItemId,
  layout: InteriorLayout,
): Pt {
  const placement = layout[id];
  const t = placement.ratio * g.wallLen(placement.wall);
  const inward = WALL_INWARD[placement.wall];

  switch (id) {
    case "window":
      return g.project(g.wallPoint(placement.wall, t, 4.2));
    case "door":
      return g.project(g.wallPoint(placement.wall, t, 5.9));
    case "desk": {
      const base = shift(g.wallPoint(placement.wall, t, 0), inward, 1.15);
      return g.project({ ...base, u: 2.5 });
    }
    case "builtins": {
      const base = shift(g.wallPoint(placement.wall, t, 0), inward, 1.05);
      return g.project({ ...base, u: 3 });
    }
  }
}

function CalloutCard({
  id,
  wall,
  target,
}: {
  id: InteriorItemId;
  wall: CABNWall;
  target: Pt;
}) {
  const slot = CALLOUT_SLOTS[id];
  const width = 172;
  const height = 64;
  const exitX = slot.side === "left" ? slot.x + width / 2 : slot.x - width / 2;
  const elbowX = slot.side === "left" ? exitX + 26 : exitX - 26;
  // Bow the leader away from the canvas center so it hugs the periphery
  // instead of slicing across the room.
  const midX = (elbowX + target.x) / 2;
  const midY = (slot.y + target.y) / 2;
  const away = Math.hypot(midX - VIEW_W / 2, midY - VIEW_H / 2) || 1;
  const controlX = midX + ((midX - VIEW_W / 2) / away) * 70;
  const controlY = midY + ((midY - VIEW_H / 2) / away) * 70;

  return (
    <g>
      <path
        d={`M ${exitX} ${slot.y} L ${elbowX} ${slot.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`}
        fill="none"
        stroke="#b0aa99"
        strokeWidth={1.2}
        opacity={0.75}
        strokeLinejoin="round"
      />
      <circle cx={target.x} cy={target.y} r={3.2} fill="#fffefb" stroke="#8f8874" />
      <rect
        x={slot.x - width / 2}
        y={slot.y - height / 2}
        width={width}
        height={height}
        rx={16}
        fill="#fffefb"
        stroke="rgba(28,30,27,0.08)"
        filter="url(#cabn-card-shadow)"
      />
      <text
        x={slot.x}
        y={slot.y - 6}
        textAnchor="middle"
        fill="#1c1e1b"
        fontSize={11.5}
        fontWeight={700}
        letterSpacing="0.14em"
      >
        {ITEM_DISPLAY[id].toUpperCase()}
      </text>
      <text
        x={slot.x}
        y={slot.y + 17}
        textAnchor="middle"
        fill="#66716a"
        fontSize={13.5}
        fontWeight={500}
      >
        {WALL_DISPLAY[wall]}
      </text>
    </g>
  );
}

function choosePlantCorner(g: Geometry, layout: InteriorLayout) {
  const counts: Record<CABNWall, number> = {
    north: 0,
    east: 0,
    south: 0,
    west: 0,
  };
  for (const id of Object.keys(layout) as InteriorItemId[]) {
    counts[layout[id].wall] += 1;
  }

  const inset = 1.35;
  const corners: Array<{ walls: [CABNWall, CABNWall]; e: number; s: number }> = [
    { walls: ["north", "west"], e: -g.W / 2 + inset, s: -g.L / 2 + inset },
    { walls: ["north", "east"], e: g.W / 2 - inset, s: -g.L / 2 + inset },
    { walls: ["south", "west"], e: -g.W / 2 + inset, s: g.L / 2 - inset },
    { walls: ["south", "east"], e: g.W / 2 - inset, s: g.L / 2 - inset },
  ];

  return corners.reduce((best, corner) => {
    const load = counts[corner.walls[0]] + counts[corner.walls[1]];
    const bestLoad = counts[best.walls[0]] + counts[best.walls[1]];
    return load < bestLoad ? corner : best;
  });
}

export function CabnInteriorPreview({
  model,
  customization,
  placementInferred,
  compact,
}: CabnInteriorPreviewProps) {
  const room: RoomDimensions = {
    widthFt: model.widthFt,
    lengthFt: model.lengthFt,
  };
  const g = createGeometry(room);
  const layout = computeInteriorLayout(customization, room);
  const { W, L } = g;

  const floorCorners: P3[] = [
    { e: -W / 2, s: -L / 2, u: 0 },
    { e: W / 2, s: -L / 2, u: 0 },
    { e: W / 2, s: L / 2, u: 0 },
    { e: -W / 2, s: L / 2, u: 0 },
  ];
  const plankCount = Math.round(W / 1.25);
  const planks = Array.from({ length: plankCount - 1 }, (_, index) => {
    const e = -W / 2 + ((index + 1) * W) / plankCount;
    const from = g.project({ e, s: -L / 2, u: 0 });
    const to = g.project({ e, s: L / 2, u: 0 });
    return (
      <line
        key={index}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#a97b4c"
        strokeWidth={1}
        opacity={0.32}
      />
    );
  });

  const floorObjects: Array<{ depth: number; node: ReactNode; key: string }> = [];
  if (layout.desk) {
    const { center } = itemCenterOnFloor(g, layout.desk, 2);
    floorObjects.push({
      depth: center.e + center.s,
      key: `desk-${layout.desk.wall}`,
      node: renderDesk(g, layout.desk),
    });
  }
  if (layout.builtins) {
    const { center } = itemCenterOnFloor(g, layout.builtins, 1.85);
    floorObjects.push({
      depth: center.e + center.s,
      key: `builtins-${layout.builtins.wall}`,
      node: renderBuiltIns(g, layout.builtins),
    });
  }
  const plantCorner = choosePlantCorner(g, layout);
  floorObjects.push({
    depth: plantCorner.e + plantCorner.s,
    key: `plant-${plantCorner.walls.join("-")}`,
    node: renderPlant(g, plantCorner),
  });
  floorObjects.sort((a, b) => a.depth - b.depth);

  const frontDoor =
    FRONT_WALLS.includes(layout.door.wall) ? layout.door : null;
  const frontWindow =
    FRONT_WALLS.includes(layout.window.wall) ? layout.window : null;

  const groundCenter = g.project({ e: 0, s: 0, u: -SLAB_D });
  const northAngle =
    (Math.atan2(g.isoX, g.isoY) * 180) / Math.PI;

  return (
    <div
      className={
        compact
          ? "flex h-full w-full flex-col overflow-hidden bg-[#f2efe6]"
          : "overflow-hidden rounded-[34px] border border-white/70 bg-[#f2efe6] shadow-[0_30px_90px_rgba(22,24,23,0.12)]"
      }
    >
      <style>{`
        @keyframes cabn-item-in {
          from { opacity: 0; transform: translateY(-7px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cabn-item-in { animation: cabn-item-in 0.5s cubic-bezier(0.22, 0.61, 0.36, 1); }
      `}</style>
      <div className={compact ? "relative min-h-0 flex-1" : "relative min-h-[540px]"}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label="Bird's-eye view into the CABN interior showing the window, door, desk, and built-ins on their selected walls"
          preserveAspectRatio="xMidYMid meet"
          className={
            compact
              ? "block h-full w-full"
              : "block h-full min-h-[540px] w-full"
          }
        >
          <defs>
            <radialGradient id="cabn-backdrop" cx="50%" cy="44%" r="65%">
              <stop offset="0%" stopColor="#faf8f1" />
              <stop offset="100%" stopColor="#efebdf" />
            </radialGradient>
            <radialGradient id="cabn-ground-shadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(40,42,38,0.22)" />
              <stop offset="72%" stopColor="rgba(40,42,38,0.09)" />
              <stop offset="100%" stopColor="rgba(40,42,38,0)" />
            </radialGradient>
            <linearGradient id="cabn-floor-wood" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ddb689" />
              <stop offset="100%" stopColor="#c3945f" />
            </linearGradient>
            <linearGradient id="cabn-wall-face" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f9f6ef" />
              <stop offset="100%" stopColor="#ece7d9" />
            </linearGradient>
            <linearGradient id="cabn-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e7f2f2" />
              <stop offset="100%" stopColor="#c2dde1" />
            </linearGradient>
            <linearGradient id="cabn-doorway" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0ece0" />
              <stop offset="100%" stopColor="#ddd8c8" />
            </linearGradient>
            <filter id="cabn-card-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodOpacity="0.14" />
            </filter>
          </defs>

          <rect width={VIEW_W} height={VIEW_H} fill="url(#cabn-backdrop)" />

          <ellipse
            cx={groundCenter.x}
            cy={groundCenter.y + 14}
            rx={(W / 2 + L / 2) * g.isoX * 1.12}
            ry={(W / 2 + L / 2) * g.isoY * 1.12 + 26}
            fill="url(#cabn-ground-shadow)"
          />

          {/* Foundation slab sides (front edges only are visible) */}
          <polygon
            points={g.pts([
              { e: W / 2, s: -L / 2, u: 0 },
              { e: W / 2, s: L / 2, u: 0 },
              { e: W / 2, s: L / 2, u: -SLAB_D },
              { e: W / 2, s: -L / 2, u: -SLAB_D },
            ])}
            fill="#a89d86"
          />
          <polygon
            points={g.pts([
              { e: -W / 2, s: L / 2, u: 0 },
              { e: W / 2, s: L / 2, u: 0 },
              { e: W / 2, s: L / 2, u: -SLAB_D },
              { e: -W / 2, s: L / 2, u: -SLAB_D },
            ])}
            fill="#b7ac95"
          />

          <polygon
            points={g.pts(floorCorners)}
            fill="url(#cabn-floor-wood)"
            stroke="#a1774a"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {planks}

          {/* Soft ambient shadow where the floor meets the back walls */}
          <polygon
            points={g.pts([
              { e: -W / 2, s: -L / 2, u: 0 },
              { e: W / 2, s: -L / 2, u: 0 },
              { e: W / 2, s: -L / 2 + 0.9, u: 0 },
              { e: -W / 2, s: -L / 2 + 0.9, u: 0 },
            ])}
            fill="rgba(40,42,38,0.07)"
          />
          <polygon
            points={g.pts([
              { e: -W / 2, s: -L / 2, u: 0 },
              { e: -W / 2 + 0.9, s: -L / 2, u: 0 },
              { e: -W / 2 + 0.9, s: L / 2, u: 0 },
              { e: -W / 2, s: L / 2, u: 0 },
            ])}
            fill="rgba(40,42,38,0.07)"
          />

          <ellipse
            cx={g.project({ e: 0, s: 0, u: 0 }).x}
            cy={g.project({ e: 0, s: 0, u: 0 }).y}
            rx={Math.min(W, L) * 0.3 * 1.414 * g.isoX}
            ry={Math.min(W, L) * 0.3 * 1.414 * g.isoY}
            fill="#eee7d8"
            opacity={0.85}
            stroke="#e0d7c4"
            strokeWidth={1.5}
          />

          {BACK_WALLS.map((wall) => (
            <g key={wall}>{renderBackWall(g, wall, layout)}</g>
          ))}

          {floorObjects.map((object) => (
            <g key={object.key} className="cabn-item-in">
              {object.node}
            </g>
          ))}

          {frontDoor ? (
            <g key={`front-door-${frontDoor.wall}`} className="cabn-item-in">
              {renderDoorLeafAndSwing(g, frontDoor, true)}
            </g>
          ) : null}

          {FRONT_WALLS.map((wall) => (
            <g key={wall}>{renderFrontWall(g, wall, layout)}</g>
          ))}

          {frontWindow ? (
            <g key={`front-window-${frontWindow.wall}`} className="cabn-item-in">
              {renderFrontGlass(g, frontWindow)}
            </g>
          ) : null}

          {(Object.keys(CALLOUT_SLOTS) as InteriorItemId[]).map((id) => (
            <CalloutCard
              key={id}
              id={id}
              wall={layout[id].wall}
              target={calloutTarget(g, id, layout)}
            />
          ))}

          {/* North indicator, aligned with the projected north direction */}
          <g transform="translate(1102 72)">
            <circle r={26} fill="#fffefb" opacity={0.94} stroke="#d3ccba" strokeWidth={1.2} />
            <g transform={`rotate(${northAngle.toFixed(1)})`}>
              <path d="M0 -15 L4.5 0 L-4.5 0 Z" fill="#203b2c" />
              <path d="M0 15 L4.5 0 L-4.5 0 Z" fill="#d9d3c2" />
            </g>
            <text
              x={Math.cos(((northAngle - 90) * Math.PI) / 180) * 41}
              y={Math.sin(((northAngle - 90) * Math.PI) / 180) * 41 + 4.5}
              textAnchor="middle"
              fill="#33403a"
              fontSize={13}
              fontWeight={600}
            >
              N
            </text>
          </g>
        </svg>

        <div className="pointer-events-none absolute left-5 top-5 rounded-full border border-white/60 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#475149] shadow-sm backdrop-blur">
          {placementInferred ? "Placement needs review" : "Roof hidden · bird's-eye view"}
        </div>
        {compact ? (
          <div className="pointer-events-none absolute bottom-5 right-5 rounded-full border border-white/60 bg-white/85 px-4 py-2 text-xs font-semibold text-[#56625c] shadow-sm backdrop-blur">
            {model.widthFt}&prime; &times; {model.lengthFt}&prime; &middot; {model.squareFeet} sq ft
          </div>
        ) : null}
      </div>

      {compact ? null : (
      <div className="border-t border-white/70 bg-[#fffefb]/92 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f0eee7] text-[#22402f]">
              <Home className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1c1e1b]">
                Interior preview
              </div>
              <p className="mt-1 max-w-xl text-sm leading-6 text-[#66716a]">
                Move features from wall to wall and the room updates instantly.
                Final positions are confirmed at your Project Confirmation
                Visit.
              </p>
            </div>
          </div>
          <div className="rounded-full border border-[#e4e1d8] bg-white px-4 py-2 text-sm font-semibold text-[#56625c]">
            {model.widthFt}&prime; &times; {model.lengthFt}&prime; &middot; {model.squareFeet} sq ft
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
