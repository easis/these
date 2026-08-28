import { describe, expect, it } from "vitest";
import { adjacentZoomLevel, clampImagePan, imageFitScale } from "./image-zoom";

describe("image zoom math", () => {
  it("fits images without exceeding 400 percent", () => {
    expect(imageFitScale({ width: 2000, height: 1000 }, { width: 1000, height: 800 })).toBe(0.5);
    expect(imageFitScale({ width: 100, height: 100 }, { width: 1000, height: 800 })).toBe(4);
  });

  it("steps through the requested levels and respects both limits", () => {
    expect(adjacentZoomLevel(1, 1)).toBe(1.25);
    expect(adjacentZoomLevel(1, -1)).toBe(0.75);
    expect(adjacentZoomLevel(4, 1)).toBe(4);
    expect(adjacentZoomLevel(0.25, -1)).toBe(0.25);
  });

  it("clamps panning to the image overflow on each axis", () => {
    expect(clampImagePan({ x: 999, y: -999 }, { width: 1000, height: 500 }, { width: 600, height: 600 }, 1)).toEqual({ x: 200, y: 0 });
    expect(clampImagePan({ x: -90, y: 50 }, { width: 1000, height: 500 }, { width: 600, height: 600 }, 2)).toEqual({ x: -90, y: 50 });
  });
});
