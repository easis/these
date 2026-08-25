import { ChevronRight, Folder, FolderHeart, HardDrive, PanelLeftClose } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { BrowseResponse, FolderEntry } from "@these/shared";
import { api, isAbortError, query } from "../lib/api";
import { clampFolderSidebarWidth, folderSidebarWidth } from "../lib/preferences";
import { useApp } from "../state/app-context";

interface TreeNodeProps {
  folder: FolderEntry;
  depth: number;
  currentPath: string | null;
  showHidden: boolean;
  hiddenOverrides: ReadonlyMap<string, boolean>;
  onOpen: (path: string) => void;
}

const TreeNode = memo(function TreeNode({ folder, depth, currentPath, showHidden, hiddenOverrides, onOpen }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(currentPath?.startsWith(`${folder.path}/`) ?? false);
  const [children, setChildren] = useState<FolderEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const hidden = isEffectivelyHidden(folder.path, folder.hidden, hiddenOverrides);

  useEffect(() => {
    if (currentPath?.startsWith(`${folder.path}/`)) setExpanded(true);
  }, [currentPath, folder.path]);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true);
    void api<BrowseResponse>(`/api/browse?${query({ path: folder.path, limit: 1, showHidden })}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setChildren(response.folders);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) setChildren([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [expanded, folder.path, showHidden]);

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <div className={`tree-row ${currentPath === folder.path ? "is-current" : ""} ${hidden ? "is-hidden" : ""}`} style={{ paddingLeft: `${6 + depth * 14}px` }}>
        <button type="button" className="tree-toggle" onClick={() => setExpanded((value) => !value)} aria-label={`${expanded ? "Collapse" : "Expand"} ${folder.displayName}`}>
          <ChevronRight className={expanded ? "rotate-90" : ""} size={13} />
        </button>
        <button type="button" className="tree-label" onClick={() => onOpen(folder.path)} title={folder.path}>
          <Folder size={14} fill="currentColor" fillOpacity={0.08} />
          <span className="truncate">{folder.displayName}</span>
        </button>
      </div>
      {expanded ? (
        <div role="group">
          {loading ? <div className="tree-note" style={{ paddingLeft: `${28 + depth * 14}px` }}>Loading…</div> : null}
          {children?.map((child) => {
            const childHidden = isEffectivelyHidden(child.path, child.hidden, hiddenOverrides);
            return showHidden || !childHidden ? <TreeNode key={child.path} folder={child} depth={depth + 1} currentPath={currentPath} showHidden={showHidden} hiddenOverrides={hiddenOverrides} onOpen={onOpen} /> : null;
          })}
        </div>
      ) : null}
    </div>
  );
});

const emptyHiddenOverrides = new Map<string, boolean>();

export function FolderTree({ currentPath, hiddenOverrides = emptyHiddenOverrides, onClose, onNavigate, modal = false }: { currentPath: string | null; hiddenOverrides?: ReadonlyMap<string, boolean>; onClose?: () => void; onNavigate?: () => void; modal?: boolean }) {
  const { bootstrap, preferences, setPreferences } = useApp();
  const navigate = useNavigate();
  const sidebar = useRef<HTMLElement>(null);
  const separator = useRef<HTMLDivElement>(null);
  const resizeSession = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [maximumWidth, setMaximumWidth] = useState(getFolderSidebarMaximumWidth);
  const renderedWidth = clampFolderSidebarWidth(preferences.leftSidebarWidth, maximumWidth);
  const width = useRef(renderedWidth);
  if (!resizeSession.current) width.current = renderedWidth;

  useEffect(() => {
    const updateMaximumWidth = () => setMaximumWidth(getFolderSidebarMaximumWidth());
    window.addEventListener("resize", updateMaximumWidth);
    return () => window.removeEventListener("resize", updateMaximumWidth);
  }, []);

  const applyWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampFolderSidebarWidth(nextWidth, maximumWidth);
    width.current = clampedWidth;
    sidebar.current?.style.setProperty("--folder-sidebar-width", `${clampedWidth}px`);
    separator.current?.setAttribute("aria-valuenow", String(clampedWidth));
    separator.current?.setAttribute("aria-valuetext", `${clampedWidth} pixels`);
    return clampedWidth;
  }, [maximumWidth]);

  const finishResize = useCallback((nextWidth: number) => {
    const clampedWidth = applyWidth(nextWidth);
    setPreferences({ leftSidebarWidth: clampedWidth });
  }, [applyWidth, setPreferences]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const panelWidth = sidebar.current?.getBoundingClientRect().width ?? 0;
    resizeSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelWidth || width.current,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, []);

  useEffect(() => {
    const continueResize = (event: PointerEvent) => {
      const session = resizeSession.current;
      if (!session || session.pointerId !== event.pointerId) return;
      applyWidth(session.startWidth + event.clientX - session.startX);
    };
    const endResize = (event: PointerEvent) => {
      const session = resizeSession.current;
      if (!session || session.pointerId !== event.pointerId) return;
      resizeSession.current = null;
      if (separator.current?.hasPointerCapture?.(event.pointerId)) separator.current.releasePointerCapture(event.pointerId);
      finishResize(width.current);
    };
    const cancelResize = (event: PointerEvent) => {
      const session = resizeSession.current;
      if (!session || session.pointerId !== event.pointerId) return;
      resizeSession.current = null;
      applyWidth(session.startWidth);
    };
    window.addEventListener("pointermove", continueResize);
    window.addEventListener("pointerup", endResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", continueResize);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
  }, [applyWidth, finishResize]);

  const resizeWithKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = width.current - folderSidebarWidth.keyboardStep;
    else if (event.key === "ArrowRight") nextWidth = width.current + folderSidebarWidth.keyboardStep;
    else if (event.key === "Home") nextWidth = folderSidebarWidth.min;
    else if (event.key === "End") nextWidth = maximumWidth;
    if (nextWidth === null) return;
    event.preventDefault();
    finishResize(nextWidth);
  }, [finishResize, maximumWidth]);

  const open = useCallback((folderPath: string) => {
    navigate(`/browse?${query({ path: folderPath })}`);
    onNavigate?.();
  }, [navigate, onNavigate]);
  const visibleFavorites = bootstrap?.favorites.filter((favorite) => favorite.status === "ok" && (preferences.showHidden || !isEffectivelyHidden(favorite.path, favorite.hidden, hiddenOverrides))) ?? [];
  return (
    <aside ref={sidebar} id="folder-sidebar" className="side-panel left-panel" role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label="Folders" tabIndex={modal ? -1 : undefined} style={{ "--folder-sidebar-width": `${renderedWidth}px` } as CSSProperties}>
      <div className="panel-heading"><span>Folders</span>{onClose ? <button className="icon-button panel-close" type="button" onClick={onClose} title="Close folders" aria-label="Close folders"><PanelLeftClose size={15} /></button> : null}</div>
      {visibleFavorites.length ? (
        <section className="border-b border-default pb-2">
          <h2 className="panel-section-label"><FolderHeart size={12} /> Favorites</h2>
          {visibleFavorites.map((favorite) => (
            <button className={`favorite-row ${isEffectivelyHidden(favorite.path, favorite.hidden, hiddenOverrides) ? "is-hidden" : ""}`} type="button" key={favorite.id} onClick={() => open(favorite.path)} title={favorite.path}>
              <span className="truncate">{favorite.alias ?? favorite.path.split("/").pop()}</span>
            </button>
          ))}
        </section>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="tree" aria-label="Media roots">
        {bootstrap?.roots.map((root) => {
          const folder: FolderEntry = { path: root.path, name: root.label, displayName: root.label, hidden: false, favorite: false };
          return root.available ? <TreeNode key={root.id} folder={folder} depth={0} currentPath={currentPath} showHidden={preferences.showHidden} hiddenOverrides={hiddenOverrides} onOpen={open} /> : (
            <div key={root.id} className="tree-row opacity-50" title={`${root.path} is unavailable`}><HardDrive size={14} /><span className="truncate">{root.label}</span></div>
          );
        })}
      </div>
      {!modal ? <div ref={separator} className="folder-sidebar-resizer" role="separator" aria-label="Resize folder sidebar" aria-orientation="vertical" aria-valuemin={folderSidebarWidth.min} aria-valuemax={maximumWidth} aria-valuenow={renderedWidth} aria-valuetext={`${renderedWidth} pixels`} tabIndex={0} title="Resize folders" onPointerDown={startResize} onKeyDown={resizeWithKeyboard} /> : null}
    </aside>
  );
}

function getFolderSidebarMaximumWidth() {
  if (typeof window === "undefined") return folderSidebarWidth.max;
  return Math.max(folderSidebarWidth.min, Math.min(folderSidebarWidth.max, Math.floor(window.innerWidth * folderSidebarWidth.viewportRatio)));
}

function isEffectivelyHidden(folderPath: string, fallback: boolean, overrides: ReadonlyMap<string, boolean>) {
  let exactOverride: boolean | undefined;
  for (const [overridePath, hidden] of overrides) {
    if (!isSameOrDescendantPath(folderPath, overridePath)) continue;
    if (hidden) return true;
    if (folderPath === overridePath) exactOverride = false;
  }
  return exactOverride ?? fallback;
}

function isSameOrDescendantPath(folderPath: string, ancestorPath: string) {
  if (folderPath === ancestorPath) return true;
  if (ancestorPath.endsWith("/") || ancestorPath.endsWith("\\")) return folderPath.startsWith(ancestorPath);
  return folderPath.startsWith(`${ancestorPath}/`) || folderPath.startsWith(`${ancestorPath}\\`);
}
