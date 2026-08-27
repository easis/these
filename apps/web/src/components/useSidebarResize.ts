import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { browserSidebarLayout, clampSidebarWidth, type SidebarWidthConfig } from "../lib/preferences";

interface SidebarResizeOptions {
  storedWidth: number;
  config: SidebarWidthConfig;
  edge: "left" | "right";
  reserveForOppositeSidebar: boolean;
  onCommit: (width: number) => void;
}

export function useSidebarResize({ storedWidth, config, edge, reserveForOppositeSidebar, onCommit }: SidebarResizeOptions) {
  const sidebarRef = useRef<HTMLElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const resizeSession = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [maximumWidth, setMaximumWidth] = useState(() => getSidebarMaximumWidth(config, reserveForOppositeSidebar));
  const renderedWidth = clampSidebarWidth(storedWidth, config, maximumWidth);
  const width = useRef(renderedWidth);
  if (!resizeSession.current) width.current = renderedWidth;

  useEffect(() => {
    const updateMaximumWidth = () => setMaximumWidth(getSidebarMaximumWidth(config, reserveForOppositeSidebar));
    updateMaximumWidth();
    window.addEventListener("resize", updateMaximumWidth);
    return () => window.removeEventListener("resize", updateMaximumWidth);
  }, [config, reserveForOppositeSidebar]);

  const applyWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampSidebarWidth(nextWidth, config, maximumWidth);
    width.current = clampedWidth;
    sidebarRef.current?.style.setProperty("--sidebar-width", `${clampedWidth}px`);
    separatorRef.current?.setAttribute("aria-valuenow", String(clampedWidth));
    separatorRef.current?.setAttribute("aria-valuetext", `${clampedWidth} pixels`);
    return clampedWidth;
  }, [config, maximumWidth]);

  const finishResize = useCallback((nextWidth: number) => {
    onCommit(applyWidth(nextWidth));
  }, [applyWidth, onCommit]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const panelWidth = sidebarRef.current?.getBoundingClientRect().width ?? 0;
    resizeSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelWidth || width.current,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, []);

  const continueResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const delta = event.clientX - session.startX;
    applyWidth(session.startWidth + (edge === "right" ? delta : -delta));
  }, [applyWidth, edge]);

  const endResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeSession.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finishResize(width.current);
  }, [finishResize]);

  const cancelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeSession.current = null;
    applyWidth(session.startWidth);
  }, [applyWidth]);

  const resizeWithKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = width.current + (edge === "left" ? config.keyboardStep : -config.keyboardStep);
    else if (event.key === "ArrowRight") nextWidth = width.current + (edge === "right" ? config.keyboardStep : -config.keyboardStep);
    else if (event.key === "Home") nextWidth = config.min;
    else if (event.key === "End") nextWidth = maximumWidth;
    if (nextWidth === null) return;
    event.preventDefault();
    finishResize(nextWidth);
  }, [config, edge, finishResize, maximumWidth]);

  return {
    sidebarRef,
    separatorRef,
    renderedWidth,
    maximumWidth,
    startResize,
    continueResize,
    endResize,
    cancelResize,
    resizeWithKeyboard,
  };
}

function getSidebarMaximumWidth(config: SidebarWidthConfig, reserveForOppositeSidebar: boolean) {
  if (typeof window === "undefined") return config.max;
  const viewportMaximum = Math.floor(window.innerWidth * config.viewportRatio);
  const combinedMaximum = reserveForOppositeSidebar && window.innerWidth > browserSidebarLayout.overlayBreakpoint
    ? Math.floor((window.innerWidth - browserSidebarLayout.minimumContentWidth) / 2)
    : config.max;
  return Math.max(config.min, Math.min(config.max, viewportMaximum, combinedMaximum));
}
