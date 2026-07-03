import { describe, expect, it } from "vitest";
import {
  computeInteriorLayout,
  INTERIOR_ITEM_IDS,
  wallForItem,
  wallLengthFt,
} from "@/lib/cabnInteriorLayout";
import {
  DEFAULT_CABN_CUSTOMIZATION,
  type CABNCustomization,
} from "@/lib/placeRoom";

const ROOM = { widthFt: 10, lengthFt: 16 };

describe("computeInteriorLayout", () => {
  it("places every item on its selected wall", () => {
    const layout = computeInteriorLayout(DEFAULT_CABN_CUSTOMIZATION, ROOM);

    for (const id of INTERIOR_ITEM_IDS) {
      expect(layout[id].wall).toBe(wallForItem(id, DEFAULT_CABN_CUSTOMIZATION));
      expect(layout[id].widthFt).toBeGreaterThan(0);
    }
  });

  it("moves only the changed item when a wall selection changes", () => {
    const before = computeInteriorLayout(DEFAULT_CABN_CUSTOMIZATION, ROOM);
    const after = computeInteriorLayout(
      { ...DEFAULT_CABN_CUSTOMIZATION, doorWall: "west" },
      ROOM,
    );

    expect(before.door.wall).toBe("east");
    expect(after.door.wall).toBe("west");
    expect(after.desk.wall).toBe(before.desk.wall);
    expect(after.window.wall).toBe(before.window.wall);
  });

  it("centers an item that is alone on its wall", () => {
    const layout = computeInteriorLayout(
      {
        windowWall: "north",
        doorWall: "east",
        deskWall: "south",
        builtInsWall: "west",
      },
      ROOM,
    );

    for (const id of INTERIOR_ITEM_IDS) {
      expect(layout[id].ratio).toBe(0.5);
    }
  });

  it("never overlaps items sharing a wall, even on the shortest wall", () => {
    const allNorth: CABNCustomization = {
      windowWall: "north",
      doorWall: "north",
      deskWall: "north",
      builtInsWall: "north",
    };
    const layout = computeInteriorLayout(allNorth, ROOM);
    const wallLen = wallLengthFt("north", ROOM);

    const segments = INTERIOR_ITEM_IDS.map((id) => {
      const placement = layout[id];
      const center = placement.ratio * wallLen;
      return [center - placement.widthFt / 2, center + placement.widthFt / 2];
    }).sort((a, b) => a[0] - b[0]);

    for (const [start, end] of segments) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(wallLen);
    }
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index][0]).toBeGreaterThanOrEqual(
        segments[index - 1][1] - 1e-9,
      );
    }
  });

  it("keeps shared-wall items within bounds on every wall", () => {
    for (const wall of ["north", "east", "south", "west"] as const) {
      const layout = computeInteriorLayout(
        {
          windowWall: wall,
          doorWall: wall,
          deskWall: wall,
          builtInsWall: wall,
        },
        ROOM,
      );
      const wallLen = wallLengthFt(wall, ROOM);

      for (const id of INTERIOR_ITEM_IDS) {
        const center = layout[id].ratio * wallLen;
        expect(center - layout[id].widthFt / 2).toBeGreaterThanOrEqual(0);
        expect(center + layout[id].widthFt / 2).toBeLessThanOrEqual(wallLen);
      }
    }
  });
});
