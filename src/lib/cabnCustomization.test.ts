import { describe, expect, it } from "vitest";
import {
  getEdgeFacingWall,
  getRotatedCabnCorners,
  getWallAnchor,
  type CabnInteriorItem,
} from "@/lib/cabnCustomization";

describe("CABN customization geometry", () => {
  it("returns a stable rotated footprint", () => {
    const unrotated = getRotatedCabnCorners({
      widthFt: 10,
      lengthFt: 16,
      rotationDeg: 0,
    });
    const rotated = getRotatedCabnCorners({
      widthFt: 10,
      lengthFt: 16,
      rotationDeg: 45,
    });

    expect(unrotated).toHaveLength(4);
    expect(rotated).toHaveLength(4);
    expect(rotated).not.toEqual(unrotated);
  });

  it("keeps north/east/south/west tied to real-world direction after rotation", () => {
    const base = {
      widthFt: 10,
      lengthFt: 16,
    };

    expect(getEdgeFacingWall({ wall: "north", rotationDeg: 0, ...base }).id).toBe(
      "north",
    );
    expect(getEdgeFacingWall({ wall: "north", rotationDeg: 90, ...base }).id).toBe(
      "east",
    );
    expect(getEdgeFacingWall({ wall: "east", rotationDeg: 90, ...base }).id).toBe(
      "south",
    );
    expect(getEdgeFacingWall({ wall: "south", rotationDeg: 180, ...base }).id).toBe(
      "north",
    );
  });

  it("staggers multiple customization items placed on the same wall", () => {
    const items: CabnInteriorItem[] = [
      { id: "window", label: "Window", wall: "west" },
      { id: "door", label: "Door", wall: "west" },
      { id: "desk", label: "Desk", wall: "west" },
      { id: "builtins", label: "Built-ins", wall: "west" },
    ];
    const base = {
      widthFt: 10,
      lengthFt: 16,
      rotationDeg: 0,
      wall: "west" as const,
      items,
    };

    const anchors = items.map((item) =>
      getWallAnchor({ ...base, itemType: item.id }),
    );
    const uniqueMarkerYs = new Set(
      anchors.map((anchor) => anchor.markerPoint.y.toFixed(2)),
    );
    const uniqueLabelYs = new Set(
      anchors.map((anchor) => anchor.labelPoint.y.toFixed(2)),
    );

    expect(uniqueMarkerYs.size).toBe(items.length);
    expect(uniqueLabelYs.size).toBe(items.length);
  });

  it("moves the cardinal wall anchor when placement rotation changes", () => {
    const unrotated = getWallAnchor({
      wall: "north",
      itemType: "window",
      widthFt: 10,
      lengthFt: 16,
      rotationDeg: 0,
    });
    const rotated = getWallAnchor({
      wall: "north",
      itemType: "window",
      widthFt: 10,
      lengthFt: 16,
      rotationDeg: 90,
    });

    expect(unrotated.edge.id).toBe("north");
    expect(rotated.edge.id).toBe("east");
    expect(rotated.markerPoint).not.toEqual(unrotated.markerPoint);
  });
});
