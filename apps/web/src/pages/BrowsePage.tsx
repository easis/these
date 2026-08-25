import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, EyeOff, Folder, PanelLeftClose, PanelRightClose, Pencil, Search, SlidersHorizontal, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { BrowseResponse, FolderEntry, ListItemStatus, MediaEntry } from "@these/shared";
import { ActiveListControl } from "../components/ActiveListControl";
import { FolderTree } from "../components/FolderTree";
import { ListSidebar } from "../components/ListSidebar";
import { MediaTile } from "../components/MediaTile";
import { Viewer } from "../components/Viewer";
import { api, isAbortError, query } from "../lib/api";
import { useApp } from "../state/app-context";

export function BrowsePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { bootstrap, activeList, preferences, setPreferences, setItemStatus, removeItem, refresh } = useApp();
  const requestedPath = new URLSearchParams(location.search).get("path") ?? preferences.lastFolder ?? bootstrap?.roots.find((root) => root.available)?.path ?? null;
  const [response, setResponse] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestSequence = useRef(0);
  const loadMoreController = useRef<AbortController | null>(null);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    loadMoreController.current?.abort();
    setViewerIndex(null);
    setResponse(null);
    setError(null);
    if (!requestedPath) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    void api<BrowseResponse>(`/api/browse?${query({ path: requestedPath, offset: 0, limit: 180, activeListId: activeList?.id, showHidden: preferences.showHidden, filter })}`, { signal: controller.signal })
      .then((next) => {
        if (sequence !== requestSequence.current) return;
        setResponse(next);
        setPreferences({ lastFolder: requestedPath });
      })
      .catch((caught: unknown) => {
        if (sequence === requestSequence.current && !isAbortError(caught)) {
          setError(caught instanceof Error ? caught.message : "Could not open this folder.");
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
    return () => controller.abort();
  }, [activeList?.id, filter, preferences.showHidden, reloadVersion, requestedPath, setPreferences]);

  const media = response?.media ?? [];

  const loadMore = useCallback(async () => {
    if (!requestedPath || !response?.hasMore || loading) return;
    loadMoreController.current?.abort();
    const controller = new AbortController();
    loadMoreController.current = controller;
    const sequence = requestSequence.current;
    setLoading(true);
    try {
      const next = await api<BrowseResponse>(`/api/browse?${query({ path: requestedPath, offset: response.offset + response.limit, limit: response.limit, activeListId: activeList?.id, showHidden: preferences.showHidden, filter })}`, { signal: controller.signal });
      if (sequence !== requestSequence.current) return;
      setResponse((current) => current && current.path === next.path ? { ...next, media: [...current.media, ...next.media] } : current);
      setError(null);
    } catch (caught) {
      if (sequence === requestSequence.current && !isAbortError(caught)) {
        setError(caught instanceof Error ? caught.message : "Could not load more media.");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [activeList?.id, filter, loading, preferences.showHidden, requestedPath, response]);

  const classify = useCallback(async (item: MediaEntry, status: ListItemStatus | null) => {
    setResponse((current) => current ? { ...current, media: current.media.map((entry) => entry.path === item.path ? { ...entry, status } : entry) } : current);
    try {
      if (status) await setItemStatus(item, status);
      else await removeItem(item.path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the list.");
      setReloadVersion((value) => value + 1);
    }
  }, [removeItem, setItemStatus]);

  const openFolder = (folderPath: string) => navigate(`/browse?${query({ path: folderPath })}`);
  const updateFolder = async (folder: FolderEntry, patch: { alias?: string | null; favorite?: boolean; hidden?: boolean }) => {
    await api("/api/folder-metadata", { method: "POST", body: JSON.stringify({ path: folder.path, ...patch }) });
    setReloadVersion((value) => value + 1);
    await refresh();
  };

  return (
    <div className="browser-layout">
      {preferences.leftSidebarOpen ? <FolderTree currentPath={response?.path ?? requestedPath} /> : null}
      <section className="gallery-panel">
        <div className="gallery-toolbar">
          {!preferences.leftSidebarOpen ? <button className="icon-button" type="button" onClick={() => setPreferences({ leftSidebarOpen: true })} aria-label="Show folder sidebar"><PanelLeftClose className="rotate-180" size={15} /></button> : null}
          <Breadcrumbs currentPath={response?.path ?? requestedPath} rootPath={response?.root.path} onOpen={openFolder} />
          <div className="ml-auto"><ActiveListControl /></div>
          {!preferences.rightSidebarOpen ? <button className="icon-button" type="button" onClick={() => setPreferences({ rightSidebarOpen: true })} aria-label="Show lists sidebar"><PanelRightClose className="rotate-180" size={15} /></button> : null}
        </div>
        <div className="gallery-subtoolbar">
          {preferences.leftSidebarOpen ? <button className="icon-button" type="button" onClick={() => setPreferences({ leftSidebarOpen: false })} title="Collapse folders" aria-label="Collapse folders"><PanelLeftClose size={15} /></button> : null}
          <label className="search-control"><Search size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter filenames" aria-label="Filter filenames" /></label>
          <span className="ml-auto text-xs tabular-nums text-muted">{response ? `${response.totalMedia} media · ${response.folders.length} folders` : ""}</span>
          <label className="size-control" title="Thumbnail size"><SlidersHorizontal size={14} /><input type="range" min="120" max="280" step="20" value={preferences.thumbnailSize} onChange={(event) => setPreferences({ thumbnailSize: Number(event.target.value) })} aria-label="Thumbnail size" /></label>
          {preferences.rightSidebarOpen ? <button className="icon-button" type="button" onClick={() => setPreferences({ rightSidebarOpen: false })} title="Collapse lists" aria-label="Collapse lists"><PanelRightClose size={15} /></button> : null}
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="gallery-scroll">
          {response?.folders.length ? <FolderGrid folders={response.folders} onOpen={openFolder} onUpdate={updateFolder} /> : null}
          {media.length ? <VirtualGallery media={media} size={preferences.thumbnailSize} activeList={Boolean(activeList)} hasMore={Boolean(response?.hasMore)} loading={loading} onLoadMore={() => void loadMore()} onOpen={setViewerIndex} onStatus={classify} />
            : loading ? <div className="empty-gallery">Opening folder…</div>
              : filter ? <div className="empty-gallery">No filenames match this filter.</div>
                : response?.folders.length === 0 ? <div className="empty-gallery">No media in this folder.</div>
                  : null}
        </div>
      </section>
      {preferences.rightSidebarOpen ? <ListSidebar /> : null}
      {viewerIndex !== null ? <Viewer items={media} index={viewerIndex} classificationContext={activeList ? `Active: ${activeList.name}` : null} classificationEnabled={Boolean(activeList)} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} onStatus={(status) => void classify(media[viewerIndex]!, status)} /> : null}
    </div>
  );
}

function Breadcrumbs({ currentPath, rootPath, onOpen }: { currentPath: string | null; rootPath?: string; onOpen: (path: string) => void }) {
  if (!currentPath || !rootPath) return <span className="text-xs text-muted">No folder</span>;
  const relative = currentPath.slice(rootPath.length).split("/").filter(Boolean);
  const crumbs = [{ label: rootPath.split("/").pop() ?? rootPath, path: rootPath }];
  for (let index = 0; index < relative.length; index += 1) crumbs.push({ label: relative[index]!, path: `${rootPath}/${relative.slice(0, index + 1).join("/")}` });
  return <nav className="breadcrumbs" aria-label="Folder path">{crumbs.map((crumb, index) => <span key={crumb.path}>{index ? <ChevronRight size={12} /> : null}<button type="button" onClick={() => onOpen(crumb.path)}>{crumb.label}</button></span>)}</nav>;
}

function FolderGrid({ folders, onOpen, onUpdate }: { folders: FolderEntry[]; onOpen: (path: string) => void; onUpdate: (folder: FolderEntry, patch: { alias?: string | null; favorite?: boolean; hidden?: boolean }) => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  return (
    <section className="folder-grid" aria-label="Folders in this directory">
      {folders.map((folder) => (
        <div className="folder-item" key={folder.path}>
          <button type="button" className="folder-open" onClick={() => onOpen(folder.path)} title={folder.path}><Folder size={15} fill="currentColor" fillOpacity={0.08} /><span className="truncate">{folder.displayName}</span></button>
          {editing === folder.path ? <form className="folder-alias-form" onSubmit={(event) => { event.preventDefault(); void onUpdate(folder, { alias }).then(() => setEditing(null)); }}><input autoFocus value={alias} onChange={(event) => setAlias(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setEditing(null)} aria-label={`Alias for ${folder.name}`} /><button type="submit">Save</button></form> : (
            <span className="folder-actions">
              <button type="button" className={folder.favorite ? "is-favorite" : ""} onClick={() => void onUpdate(folder, { favorite: !folder.favorite })} title={folder.favorite ? "Remove favorite" : "Favorite"} aria-label={folder.favorite ? "Remove favorite" : "Favorite"}><Star size={12} fill={folder.favorite ? "currentColor" : "none"} /></button>
              <button type="button" onClick={() => { setEditing(folder.path); setAlias(folder.displayName === folder.name ? "" : folder.displayName); }} title="Edit alias" aria-label="Edit alias"><Pencil size={12} /></button>
              <button type="button" onClick={() => void onUpdate(folder, { hidden: true })} title="Hide folder subtree" aria-label="Hide folder"><EyeOff size={12} /></button>
            </span>
          )}
        </div>
      ))}
    </section>
  );
}

function VirtualGallery({ media, size, activeList, hasMore, loading, onLoadMore, onOpen, onStatus }: { media: MediaEntry[]; size: number; activeList: boolean; hasMore: boolean; loading: boolean; onLoadMore: () => void; onOpen: (index: number) => void; onStatus: (item: MediaEntry, status: ListItemStatus | null) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!parentRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 800));
    observer.observe(parentRef.current);
    return () => observer.disconnect();
  }, []);
  const gap = 7;
  const columns = Math.max(1, Math.floor((width + gap) / (size + gap)));
  const rowCount = Math.ceil(media.length / columns);
  const virtualizer = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => size + 32 + gap, overscan: 3 });
  return (
    <div ref={parentRef} className="virtual-gallery-scroll">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize() + (hasMore ? 46 : 8)}px` }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div key={row.key} className="absolute left-0 top-0 grid w-full" style={{ transform: `translateY(${row.start}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: `${gap}px`, height: `${row.size - gap}px` }}>
            {media.slice(row.index * columns, row.index * columns + columns).map((item, column) => {
              const itemIndex = row.index * columns + column;
              return <MediaTile key={item.path} media={item} size={size} activeList={activeList} onOpen={() => onOpen(itemIndex)} onStatus={(status) => onStatus(item, status)} />;
            })}
          </div>
        ))}
        {hasMore ? <button className="load-more" style={{ top: virtualizer.getTotalSize() }} type="button" disabled={loading} onClick={onLoadMore}>{loading ? "Loading…" : "Load more"}</button> : null}
      </div>
    </div>
  );
}
