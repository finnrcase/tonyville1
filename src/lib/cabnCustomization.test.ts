import { describe, expect, it } from "vitest";
import {
  getEdgeFacingWall,
  getRotatedCabnCorners,
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
});
