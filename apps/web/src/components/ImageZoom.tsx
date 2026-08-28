import { Maximize, Minus, Plus, Scan } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { adjacentZoomLevel, clampImagePan, imageFitScale, imagePanForZoom, type Point2D, type Size2D } from "../lib/image-zoom";
import styles from "./Viewer.module.css";

interface ImageZoomProps {
  path: string;
  name: string;
  src: string;
  layoutKey: boolean;
}

export function ImageZoom({ path, name, src, layoutKey }: ImageZoomProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; start: Point2D; pan: Point2D } | null>(null);
  const [imageSize, setImageSize] = useState<Size2D>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<Size2D>({ width: 0, height: 0 });
  const [mode, setMode] = useState<"fit" | "custom">("fit");
  const [customScale, setCustomScale] = useState(1);
  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 });
  const fitScale = imageFitScale(imageSize, viewportSize);
  const scale = mode === "fit" ? fitScale : customScale;
  const pannable = imageSize.width * scale > viewportSize.width + 1 || imageSize.height * scale > viewportSize.height + 1;

  useEffect(() => {
    setMode("fit");
    setCustomScale(1);
    setPan({ x: 0, y: 0 });
    setImageSize({ width: 0, height: 0 });
  }, [path]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportSize((current) => {
      const next = { width: viewport.clientWidth, height: viewport.clientHeight };
      return current.width === next.width && current.height === next.height ? current : next;
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [layoutKey]);

  useEffect(() => {
    setPan((current) => clampImagePan(current, imageSize, viewportSize, scale));
  }, [imageSize, scale, viewportSize]);

  const setZoom = useCallback((nextScale: number, anchor?: Point2D) => {
    const limited = Math.max(0.25, Math.min(4, nextScale));
    setMode("custom");
    setCustomScale(limited);
    setPan((current) => clampImagePan(anchor ? imagePanForZoom(current, anchor, scale, limited) : current, imageSize, viewportSize, limited));
  }, [imageSize, scale, viewportSize]);

  const fit = useCallback(() => {
    setMode("fit");
    setPan({ x: 0, y: 0 });
  }, []);
  const actual = useCallback(() => setZoom(1), [setZoom]);
  const step = useCallback((direction: 1 | -1, anchor?: Point2D) => {
    const nextScale = adjacentZoomLevel(scale, direction);
    if (direction > 0 ? nextScale <= scale : nextScale >= scale) return;
    setZoom(nextScale, anchor);
  }, [scale, setZoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const zoomWithWheel = (event: WheelEvent) => {
      if (!event.deltaY || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      const bounds = viewport.getBoundingClientRect();
      step(event.deltaY < 0 ? 1 : -1, {
        x: event.clientX - bounds.left - bounds.width / 2,
        y: event.clientY - bounds.top - bounds.height / 2,
      });
    };
    viewport.addEventListener("wheel", zoomWithWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", zoomWithWheel);
  }, [step]);

  useEffect(() => {
    const handleZoomKeys = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "+" || event.key === "=") step(1);
      else if (event.key === "-") step(-1);
      else if (event.key.toLowerCase() === "f") fit();
      else if (event.key.toLowerCase() === "a") actual();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleZoomKeys);
    return () => window.removeEventListener("keydown", handleZoomKeys);
  }, [actual, fit, step]);

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      fit();
      return;
    }
    if (!pannable || event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, pan };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setPan(clampImagePan({ x: current.pan.x + event.clientX - current.start.x, y: current.pan.y + event.clientY - current.start.y }, imageSize, viewportSize, scale));
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const percent = Math.round(scale * 100);
  return <div ref={viewportRef} className={`${styles.zoomViewport} ${pannable ? styles.zoomPannable : ""}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
    <img
      src={src}
      alt={name}
      draggable={false}
      onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
      style={imageSize.width ? { width: imageSize.width * scale, height: imageSize.height * scale, transform: `translate3d(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px), 0)` } : undefined}
    />
    <div className={styles.zoomControls} role="group" aria-label="Image zoom controls" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => step(-1)} disabled={scale <= 0.25} title="Zoom out (-)" aria-label="Zoom out"><Minus size={17} /></button>
      <button type="button" className={styles.zoomReadout} onClick={fit} title="Fit image (F)" aria-label={`Fit image, current zoom ${percent}%`}><Scan size={15} /><span>{mode === "fit" ? "Fit" : `${percent}%`}</span></button>
      <button type="button" onClick={actual} title="Actual size (A)" aria-label="Show at actual size"><Maximize size={15} /><span>1:1</span></button>
      <button type="button" onClick={() => step(1)} disabled={scale >= 4} title="Zoom in (+)" aria-label="Zoom in"><Plus size={17} /></button>
    </div>
  </div>;
}
