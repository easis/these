export const zoomLevels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export interface Size2D { width: number; height: number }
export interface Point2D { x: number; y: number }

export function imageFitScale(image: Size2D, viewport: Size2D) {
  if (!image.width || !image.height || !viewport.width || !viewport.height) return 1;
  return Math.min(viewport.width / image.width, viewport.height / image.height, 4);
}

export function adjacentZoomLevel(scale: number, direction: 1 | -1) {
  if (direction > 0) return zoomLevels.find((level) => level > scale + 0.001) ?? zoomLevels.at(-1)!;
  return [...zoomLevels].reverse().find((level) => level < scale - 0.001) ?? zoomLevels[0];
}

export function imagePanForZoom(pan: Point2D, anchor: Point2D, currentScale: number, nextScale: number): Point2D {
  if (currentScale <= 0 || currentScale === nextScale) return pan;
  const ratio = nextScale / currentScale;
  return {
    x: anchor.x - (anchor.x - pan.x) * ratio,
    y: anchor.y - (anchor.y - pan.y) * ratio,
  };
}

export function clampImagePan(pan: Point2D, image: Size2D, viewport: Size2D, scale: number): Point2D {
  const limitX = Math.max(0, (image.width * scale - viewport.width) / 2);
  const limitY = Math.max(0, (image.height * scale - viewport.height) / 2);
  return {
    x: limitX === 0 ? 0 : Math.max(-limitX, Math.min(limitX, pan.x)),
    y: limitY === 0 ? 0 : Math.max(-limitY, Math.min(limitY, pan.y)),
  };
}
