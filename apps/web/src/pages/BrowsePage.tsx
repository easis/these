import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Ellipsis, Eye, EyeOff, Folder, Image, PanelLeftClose, PanelRightClose, Pencil, Search, SlidersHorizontal, Star, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { BrowseResponse, FolderEntry, FolderMetadata, ListItemStatus, MediaEntry, MediaKind } from "@these/shared";
import { FolderTree } from "../components/FolderTree";
import { ListSidebar } from "../components/ListSidebar";
import { MediaTile } from "../components/MediaTile";
import { Viewer } from "../components/Viewer";
import { api, isAbortError, query } from "../lib/api";
import { useApp } from "../state/app-context";

const compactViewportQuery = "(max-width: 720px) or ((max-width: 900px) and (max-height: 500px))";
const panelFocusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isCompactViewport() {
  return typeof matchMedia === "function" && matchMedia(compactViewportQuery).matches;
}

export function BrowsePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { bootstrap, activeList, preferences, setPreferences, setItemStatus, removeItem, refresh } = useApp();
  const requestedPath = new URLSearchParams(location.search).get("path") ?? preferences.lastFolder ?? bootstrap?.roots.find((root) => root.available)?.path ?? null;
  const [response, setResponse] = useState<BrowseResponse | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [mediaKinds, setMediaKinds] = useState<MediaKind[]>(["image", "video"]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerAdvancePending, setViewerAdvancePending] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [pendingFolderPaths, setPendingFolderPaths] = useState<Set<string>>(() => new Set());
  const [pendingMediaPaths, setPendingMediaPaths] = useState<Set<string>>(() => new Set());
  const [folderHiddenOverrides, setFolderHiddenOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [compactViewport, setCompactViewport] = useState(isCompactViewport);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const requestSequence = useRef(0);
  const browseRequest = useRef<{ sequence: number; promise: Promise<boolean> } | null>(null);
  const loadMoreController = useRef<AbortController | null>(null);
  const loadMoreRequest = useRef<{ sequence: number; promise: Promise<LoadMoreResult> } | null>(null);
  const autoPrefetchKey = useRef<string | null>(null);
  const viewerSession = useRef(0);
  const displayedPath = useRef<string | null>(null);
  const previousActiveListId = useRef<number | null | undefined>(undefined);
  const currentActiveListId = useRef(activeList?.id ?? null);
  const responseRef = useRef<BrowseResponse | null>(null);
  const pendingFolderPathsRef = useRef(new Set<string>());
  const pendingMediaPathsRef = useRef(new Set<string>());
  const optimisticFolderPatches = useRef(new Map<string, FolderPatch>());
  const optimisticMediaStatuses = useRef(new Map<string, ListItemStatus | null>());
  const folderSidebarTrigger = useRef<HTMLButtonElement>(null);
  const listSidebarTrigger = useRef<HTMLButtonElement>(null);
  const mobileControlsTrigger = useRef<HTMLButtonElement>(null);
  const pendingPanelFocus = useRef<"folders" | "lists" | "controls" | null>(null);
  const activeFolderView = useRef({ filter, showHidden: preferences.showHidden });
  const kinds = mediaKinds.join(",");
  const loading = browseLoading || loadingMore;
  const error = mutationError ?? requestError;
  currentActiveListId.current = activeList?.id ?? null;
  responseRef.current = response;
  activeFolderView.current = { filter, showHidden: preferences.showHidden };

  const closeFolderPanel = useCallback((restoreFocus: boolean) => {
    pendingPanelFocus.current = restoreFocus ? "folders" : null;
    setPreferences({ leftSidebarOpen: false });
  }, [setPreferences]);

  const closeListPanel = useCallback((restoreFocus: boolean) => {
    pendingPanelFocus.current = restoreFocus ? "lists" : null;
    setPreferences({ rightSidebarOpen: false });
  }, [setPreferences]);

  const closeOpenMobilePanel = useCallback(() => {
    if (!compactViewport) return;
    pendingPanelFocus.current = preferences.leftSidebarOpen ? "folders" : preferences.rightSidebarOpen ? "lists" : mobileControlsOpen ? "controls" : null;
    setMobileControlsOpen(false);
    setPreferences({ leftSidebarOpen: false, rightSidebarOpen: false });
  }, [compactViewport, mobileControlsOpen, preferences.leftSidebarOpen, preferences.rightSidebarOpen, setPreferences]);

  const closeFolderPanelWithFocus = useCallback(() => closeFolderPanel(compactViewport), [closeFolderPanel, compactViewport]);
  const closeListPanelWithFocus = useCallback(() => closeListPanel(compactViewport), [closeListPanel, compactViewport]);
  const closeFolderAfterNavigation = useCallback(() => {
    if (compactViewport) closeFolderPanel(false);
  }, [closeFolderPanel, compactViewport]);
  const closeListAfterSelection = useCallback(() => {
    if (compactViewport) closeListPanel(false);
  }, [closeListPanel, compactViewport]);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia(compactViewportQuery);
    const update = () => setCompactViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (compactViewport && preferences.leftSidebarOpen && preferences.rightSidebarOpen) setPreferences({ rightSidebarOpen: false });
  }, [compactViewport, preferences.leftSidebarOpen, preferences.rightSidebarOpen, setPreferences]);

  useEffect(() => {
    if (!compactViewport && mobileControlsOpen) setMobileControlsOpen(false);
  }, [compactViewport, mobileControlsOpen]);

  useEffect(() => {
    if (pendingPanelFocus.current === "folders" && !preferences.leftSidebarOpen) {
      folderSidebarTrigger.current?.focus();
      pendingPanelFocus.current = null;
    } else if (pendingPanelFocus.current === "lists" && !preferences.rightSidebarOpen) {
      listSidebarTrigger.current?.focus();
      pendingPanelFocus.current = null;
    } else if (pendingPanelFocus.current === "controls" && !mobileControlsOpen) {
      mobileControlsTrigger.current?.focus();
      pendingPanelFocus.current = null;
    }
  }, [mobileControlsOpen, preferences.leftSidebarOpen, preferences.rightSidebarOpen]);

  const mobilePanel = compactViewport && viewerIndex === null
    ? preferences.leftSidebarOpen ? "folders" : preferences.rightSidebarOpen ? "lists" : mobileControlsOpen ? "controls" : null
    : null;
  useEffect(() => {
    if (!mobilePanel) return;
    const panel = document.getElementById(mobilePanel === "folders" ? "folder-sidebar" : mobilePanel === "lists" ? "list-sidebar" : "browser-controls-panel");
    if (!panel) return;
    const shell = panel.closest(".app-shell");
    const shellSiblings = shell
      ? Array.from(shell.children).filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(panel))
      : [];
    const siblingInertState = shellSiblings.map((element) => [element, element.hasAttribute("inert")] as const);
    for (const element of shellSiblings) element.setAttribute("inert", "");
    const getFocusable = () => Array.from(panel.querySelectorAll<HTMLElement>(panelFocusableSelector));
    if (!panel.contains(document.activeElement)) (getFocusable()[0] ?? panel).focus();
    const containPanelFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOpenMobilePanel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      const first = focusable[0] ?? panel;
      const last = focusable.at(-1) ?? panel;
      const focusOutsidePanel = !panel.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusOutsidePanel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusOutsidePanel)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containPanelFocus);
    return () => {
      window.removeEventListener("keydown", containPanelFocus);
      for (const [element, wasInert] of siblingInertState) {
        if (!wasInert) element.removeAttribute("inert");
      }
    };
  }, [closeOpenMobilePanel, mobilePanel]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    loadMoreController.current?.abort();
    autoPrefetchKey.current = null;
    const activeListId = activeList?.id ?? null;
    const activeListChanged = previousActiveListId.current !== undefined && previousActiveListId.current !== activeListId;
    previousActiveListId.current = activeListId;
    const navigating = displayedPath.current !== requestedPath;
    if (navigating) {
      viewerSession.current += 1;
      setViewerIndex(null);
      setViewerAdvancePending(false);
      setResponse(null);
      setRequestError(null);
      setMutationError(null);
    } else if (activeListChanged) {
      optimisticMediaStatuses.current.clear();
      setResponse((current) => current ? { ...current, media: current.media.map((entry) => entry.status === null ? entry : { ...entry, status: null }) } : current);
    }
    if (!requestedPath) {
      browseRequest.current = null;
      setBrowseLoading(false);
      return;
    }

    const controller = new AbortController();
    setBrowseLoading(true);
    const operation = api<BrowseResponse>(`/api/browse?${query({ path: requestedPath, offset: 0, limit: 180, activeListId: activeList?.id, showHidden: preferences.showHidden, filter, kinds })}`, { signal: controller.signal })
      .then((next) => {
        if (sequence !== requestSequence.current) return false;
        const applied = applyOptimisticState(next, optimisticFolderPatches.current, optimisticMediaStatuses.current, preferences.showHidden, filter);
        displayedPath.current = next.path;
        responseRef.current = applied;
        setResponse(applied);
        reconcileOptimisticState(next, optimisticFolderPatches.current, optimisticMediaStatuses.current, preferences.showHidden, filter);
        setRequestError(null);
        setPreferences({ lastFolder: requestedPath });
        return true;
      })
      .catch((caught: unknown) => {
        if (sequence === requestSequence.current && !isAbortError(caught)) {
          setRequestError(caught instanceof Error ? caught.message : "Could not open this folder.");
        }
        return false;
      })
      .finally(() => {
        if (browseRequest.current?.sequence === sequence) browseRequest.current = null;
        if (sequence === requestSequence.current) setBrowseLoading(false);
      });
    browseRequest.current = { sequence, promise: operation };
    void operation;
    return () => controller.abort();
  }, [activeList?.id, filter, kinds, preferences.showHidden, reloadVersion, requestedPath, setPreferences]);

  const media = response?.media ?? [];

  const loadMore = useCallback((): Promise<LoadMoreResult> => {
    const sequence = requestSequence.current;
    const inFlight = loadMoreRequest.current;
    if (inFlight?.sequence === sequence) return inFlight.promise;
    if (browseRequest.current?.sequence === sequence) return Promise.resolve({ added: 0, applied: false, hasMore: responseRef.current?.hasMore ?? false });
    const currentResponse = responseRef.current;
    if (!requestedPath || !currentResponse?.hasMore) return Promise.resolve({ added: 0, applied: true, hasMore: false });
    loadMoreController.current?.abort();
    const controller = new AbortController();
    loadMoreController.current = controller;
    setLoadingMore(true);
    const operation = (async (): Promise<LoadMoreResult> => {
      let cursor = currentResponse;
      let added = 0;
      try {
        while (cursor.hasMore && added === 0) {
          const next: BrowseResponse = await api<BrowseResponse>(`/api/browse?${query({ path: requestedPath, offset: cursor.offset + cursor.limit, limit: cursor.limit, activeListId: activeList?.id, showHidden: preferences.showHidden, filter, kinds })}`, { signal: controller.signal });
          if (sequence !== requestSequence.current || next.path !== requestedPath) return { added: 0, applied: false, hasMore: next.hasMore };
          setResponse((current) => current && current.path === next.path
            ? applyOptimisticState({ ...next, media: [...current.media, ...next.media] }, optimisticFolderPatches.current, optimisticMediaStatuses.current, preferences.showHidden, filter)
            : current);
          reconcileOptimisticState(next, optimisticFolderPatches.current, optimisticMediaStatuses.current, preferences.showHidden, filter);
          cursor = next;
          added += next.media.length;
        }
        setRequestError(null);
        return { added, applied: true, hasMore: cursor.hasMore };
      } catch (caught) {
        if (sequence === requestSequence.current && !isAbortError(caught)) {
          setRequestError(caught instanceof Error ? caught.message : "Could not load more media.");
        }
        return { added: 0, applied: false, hasMore: cursor.hasMore };
      }
    })();
    const shared = operation.finally(() => {
      if (loadMoreRequest.current?.promise === shared) {
        loadMoreRequest.current = null;
        setLoadingMore(false);
      }
    });
    loadMoreRequest.current = { sequence, promise: shared };
    return shared;
  }, [activeList?.id, filter, kinds, preferences.showHidden, requestedPath]);

  useEffect(() => {
    const atLoadedEnd = viewerIndex !== null && viewerIndex === media.length - 1 && Boolean(response?.hasMore);
    if (!atLoadedEnd || !response) {
      autoPrefetchKey.current = null;
      return;
    }
    if (browseLoading || browseRequest.current?.sequence === requestSequence.current) return;
    const key = `${response.path}:${response.offset}:${media.length}`;
    if (autoPrefetchKey.current === key) return;
    autoPrefetchKey.current = key;
    void loadMore();
  }, [browseLoading, loadMore, media.length, response, viewerIndex]);

  const advanceViewer = useCallback(async () => {
    if (viewerIndex === null) return;
    if (viewerIndex < media.length - 1) {
      setViewerIndex(viewerIndex + 1);
      return;
    }
    if (!response?.hasMore) return;
    const sourceIndex = viewerIndex;
    const session = viewerSession.current;
    setViewerAdvancePending(true);
    while (browseRequest.current?.sequence === requestSequence.current) {
      await browseRequest.current.promise;
      if (viewerSession.current !== session) return;
    }
    const result = await loadMore();
    if (viewerSession.current !== session) return;
    if (result.applied && result.added > 0) {
      setViewerIndex((current) => current === sourceIndex ? sourceIndex + 1 : current);
    }
    setViewerAdvancePending(false);
  }, [loadMore, media.length, response?.hasMore, viewerIndex]);

  const openViewer = useCallback((index: number) => {
    viewerSession.current += 1;
    setViewerAdvancePending(false);
    setViewerIndex(index);
  }, []);

  const closeViewer = useCallback(() => {
    viewerSession.current += 1;
    setViewerIndex(null);
    setViewerAdvancePending(false);
  }, []);

  const classify = useCallback(async (item: MediaEntry, status: ListItemStatus | null) => {
    if (pendingMediaPathsRef.current.has(item.path)) return;
    const mutationListId = currentActiveListId.current;
    pendingMediaPathsRef.current.add(item.path);
    setPendingMediaPaths(new Set(pendingMediaPathsRef.current));
    optimisticMediaStatuses.current.set(item.path, status);
    setResponse((current) => current ? { ...current, media: current.media.map((entry) => entry.path === item.path ? { ...entry, status } : entry) } : current);
    try {
      if (status) await setItemStatus(item, status);
      else await removeItem(item.path);
      setMutationError(null);
    } catch (caught) {
      optimisticMediaStatuses.current.delete(item.path);
      if (currentActiveListId.current === mutationListId) {
        setResponse((current) => current ? { ...current, media: current.media.map((entry) => entry.path === item.path ? { ...entry, status: item.status } : entry) } : current);
      }
      setMutationError(caught instanceof Error ? caught.message : "Could not update the list.");
      setReloadVersion((value) => value + 1);
    } finally {
      pendingMediaPathsRef.current.delete(item.path);
      setPendingMediaPaths(new Set(pendingMediaPathsRef.current));
    }
  }, [removeItem, setItemStatus]);

  const openFolder = (folderPath: string) => navigate(`/browse?${query({ path: folderPath })}`);
  const updateFolderHiddenOverride = (folderPath: string, hidden: boolean) => {
    setFolderHiddenOverrides((current) => {
      if (current.get(folderPath) === hidden) return current;
      const next = new Map(current);
      next.set(folderPath, hidden);
      return next;
    });
  };
  const updateFolder = async (folder: FolderEntry, patch: FolderPatch) => {
    if (pendingFolderPathsRef.current.has(folder.path)) return false;
    const mutationBrowsePath = responseRef.current?.path;
    const previousFolder = findBrowseFolder(responseRef.current, folder.path) ?? folder;
    pendingFolderPathsRef.current.add(folder.path);
    setPendingFolderPaths(new Set(pendingFolderPathsRef.current));
    optimisticFolderPatches.current.set(folder.path, patch);
    if (patch.hidden !== undefined) updateFolderHiddenOverride(folder.path, patch.hidden);
    setResponse((current) => current ? applyFolderPatchToBrowse(current, folder.path, patch, activeFolderView.current.showHidden, activeFolderView.current.filter) : current);
    try {
      const saved = await api<FolderMetadata>("/api/folder-metadata", { method: "POST", body: JSON.stringify({ path: folder.path, ...patch }) });
      const savedPatch: FolderPatch = { alias: saved.alias, favorite: saved.favorite, hidden: saved.hidden };
      optimisticFolderPatches.current.set(folder.path, savedPatch);
      if (patch.hidden !== undefined) updateFolderHiddenOverride(folder.path, saved.hidden ?? patch.hidden);
      setResponse((current) => current ? applyFolderPatchToBrowse(current, folder.path, savedPatch, activeFolderView.current.showHidden, activeFolderView.current.filter) : current);
      setReloadVersion((value) => value + 1);
      void refresh();
      setMutationError(null);
      return true;
    } catch (caught) {
      optimisticFolderPatches.current.delete(folder.path);
      if (patch.hidden !== undefined) updateFolderHiddenOverride(folder.path, previousFolder.hidden);
      setResponse((current) => current && current.path === mutationBrowsePath
        ? restoreBrowseFolder(current, previousFolder, activeFolderView.current.showHidden, activeFolderView.current.filter)
        : current);
      setMutationError(caught instanceof Error ? caught.message : "Could not update the folder.");
      return false;
    } finally {
      pendingFolderPathsRef.current.delete(folder.path);
      setPendingFolderPaths(new Set(pendingFolderPathsRef.current));
    }
  };
  const toggleMediaKind = (kind: MediaKind) => setMediaKinds((current) => {
    if (current.includes(kind)) return current.length === 1 ? current : current.filter((value) => value !== kind);
    return (["image", "video"] as const).filter((value) => value === kind || current.includes(value));
  });
  const toggleCurrentHidden = async (folder: FolderEntry) => {
    const nextHidden = !folder.hidden;
    if (!await updateFolder(folder, { hidden: nextHidden }) || !nextHidden || !response) return;
    const parentPath = parentFolderPath(folder.path, response.root.path);
    if (parentPath) openFolder(parentPath);
  };

  return (
    <div className="browser-layout">
      {preferences.leftSidebarOpen ? <FolderTree currentPath={response?.path ?? requestedPath} hiddenOverrides={folderHiddenOverrides} modal={mobilePanel === "folders"} onClose={closeFolderPanelWithFocus} onNavigate={closeFolderAfterNavigation} /> : null}
      <section className="gallery-panel" inert={Boolean(mobilePanel)}>
        <div className="gallery-toolbar">
          {!preferences.leftSidebarOpen ? <button ref={folderSidebarTrigger} className="icon-button browser-navigation-button" type="button" onClick={() => { setMobileControlsOpen(false); setPreferences({ leftSidebarOpen: true, ...(compactViewport ? { rightSidebarOpen: false } : {}) }); }} aria-controls="folder-sidebar" aria-expanded="false" aria-label="Show folder sidebar"><PanelLeftClose className="rotate-180" size={15} /></button> : null}
          <Breadcrumbs currentPath={response?.path ?? requestedPath} rootPath={response?.root.path} currentDisplayName={response?.currentFolder.displayName} onOpen={openFolder} />
          <span className="ml-auto" />
          {!preferences.rightSidebarOpen ? <button ref={listSidebarTrigger} className="icon-button browser-navigation-button" type="button" onClick={() => { setMobileControlsOpen(false); setPreferences({ rightSidebarOpen: true, ...(compactViewport ? { leftSidebarOpen: false } : {}) }); }} aria-controls="list-sidebar" aria-expanded="false" aria-label="Show lists sidebar"><PanelRightClose className="rotate-180" size={15} /></button> : null}
          {response?.currentFolder && !compactViewport ? <span className="desktop-current-folder-actions"><CurrentFolderActions folder={response.currentFolder} canHide={response.path !== response.root.path} pending={pendingFolderPaths.has(response.currentFolder.path)} onUpdate={updateFolder} onToggleHidden={toggleCurrentHidden} /></span> : null}
        </div>
        <div className="gallery-subtoolbar">
          {preferences.leftSidebarOpen && !compactViewport ? <button className="icon-button desktop-browser-control" type="button" onClick={() => closeFolderPanel(false)} aria-controls="folder-sidebar" aria-expanded="true" title="Collapse folders" aria-label="Collapse folders"><PanelLeftClose size={15} /></button> : null}
          <div className="search-control" role="search"><Search size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search files and folders" aria-label="Search files and folders" />{filter ? <button className="search-clear" type="button" onClick={() => setFilter("")} aria-label="Clear search"><X size={13} /></button> : null}</div>
          {!compactViewport ? <div className="media-kind-filters desktop-browser-control" role="group" aria-label="File types">
            <button type="button" className={mediaKinds.includes("image") ? "is-active" : ""} aria-pressed={mediaKinds.includes("image")} onClick={() => toggleMediaKind("image")}><Image size={13} />Images</button>
            <button type="button" className={mediaKinds.includes("video") ? "is-active" : ""} aria-pressed={mediaKinds.includes("video")} onClick={() => toggleMediaKind("video")}><Video size={13} />Videos</button>
          </div> : null}
          {!compactViewport ? <button className={`show-hidden-toggle desktop-browser-control ${preferences.showHidden ? "is-active" : ""}`} type="button" aria-pressed={preferences.showHidden} onClick={() => setPreferences({ showHidden: !preferences.showHidden })} title={preferences.showHidden ? "Hide hidden folders" : "Show hidden folders"}>
            {preferences.showHidden ? <Eye size={14} /> : <EyeOff size={14} />}<span>{preferences.showHidden ? "Hidden shown" : "Show hidden"}</span>
          </button> : null}
          {!compactViewport ? <span className="desktop-browser-control ml-auto text-xs tabular-nums text-muted">{response ? `${response.totalMedia} media · ${response.folders.length} folders` : ""}</span> : null}
          {!compactViewport ? <label className="size-control desktop-browser-control" title="Thumbnail size"><SlidersHorizontal size={14} /><input type="range" min="120" max="280" step="20" value={preferences.thumbnailSize} onChange={(event) => setPreferences({ thumbnailSize: Number(event.target.value) })} aria-label="Thumbnail size" /></label> : null}
          {preferences.rightSidebarOpen && !compactViewport ? <button className="icon-button desktop-browser-control" type="button" onClick={() => closeListPanel(false)} aria-controls="list-sidebar" aria-expanded="true" title="Collapse lists" aria-label="Collapse lists"><PanelRightClose size={15} /></button> : null}
          {compactViewport ? <button ref={mobileControlsTrigger} className="icon-button mobile-browser-control mobile-more-button" type="button" onClick={() => { setPreferences({ leftSidebarOpen: false, rightSidebarOpen: false }); setMobileControlsOpen(true); }} aria-controls="browser-controls-panel" aria-expanded={mobileControlsOpen} aria-label="Show browser options"><Ellipsis size={20} /></button> : null}
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="gallery-scroll" aria-busy={loading}>
          {response?.folders.length ? <FolderGrid folders={response.folders} pendingPaths={pendingFolderPaths} onOpen={openFolder} onUpdate={updateFolder} /> : null}
          {media.length ? <VirtualGallery media={media} size={preferences.thumbnailSize} activeList={Boolean(activeList)} pendingPaths={pendingMediaPaths} hasMore={Boolean(response?.hasMore)} loading={loading} onLoadMore={() => void loadMore()} onOpen={openViewer} onStatus={classify} />
            : loading && !response ? <div className="empty-gallery">Opening folder…</div>
              : filter && response?.folders.length === 0 ? <div className="empty-gallery">No files or folders match this search.</div>
                : response?.folders.length === 0 ? <div className="empty-gallery">{mediaKinds.length === 1 ? `No ${mediaKinds[0] === "image" ? "images" : "videos"} in this folder.` : "No media in this folder."}</div>
                  : null}
        </div>
      </section>
      {preferences.rightSidebarOpen ? <ListSidebar modal={mobilePanel === "lists"} onClose={closeListPanelWithFocus} onSelection={closeListAfterSelection} /> : null}
      {compactViewport && mobileControlsOpen ? <MobileBrowserControls folder={response?.currentFolder ?? null} canHide={Boolean(response && response.path !== response.root.path)} pending={Boolean(response && pendingFolderPaths.has(response.currentFolder.path))} mediaKinds={mediaKinds} showHidden={preferences.showHidden} thumbnailSize={preferences.thumbnailSize} onClose={() => { pendingPanelFocus.current = "controls"; setMobileControlsOpen(false); }} onToggleKind={toggleMediaKind} onShowHidden={(showHidden) => setPreferences({ showHidden })} onThumbnailSize={(thumbnailSize) => setPreferences({ thumbnailSize })} onUpdateFolder={updateFolder} onToggleHidden={toggleCurrentHidden} /> : null}
      {mobilePanel ? <button className="panel-backdrop" type="button" tabIndex={-1} onClick={closeOpenMobilePanel} aria-label="Close navigation panel" /> : null}
      {viewerIndex !== null ? <Viewer items={media} index={viewerIndex} classificationContext={activeList?.name ?? null} classificationEnabled={Boolean(activeList)} classificationPending={pendingMediaPaths.has(media[viewerIndex]?.path ?? "")} hasNext={viewerIndex < media.length - 1 || Boolean(response?.hasMore)} nextPending={viewerAdvancePending} onIndex={setViewerIndex} onNext={() => void advanceViewer()} onClose={closeViewer} onStatus={(status) => void classify(media[viewerIndex]!, status)} /> : null}
    </div>
  );
}

function Breadcrumbs({ currentPath, rootPath, currentDisplayName, onOpen }: { currentPath: string | null; rootPath?: string; currentDisplayName?: string; onOpen: (path: string) => void }) {
  if (!currentPath || !rootPath) return <span className="text-xs text-muted">No folder</span>;
  const relative = currentPath.slice(rootPath.length).split("/").filter(Boolean);
  const crumbs = [{ label: rootPath.split("/").pop() ?? rootPath, path: rootPath }];
  for (let index = 0; index < relative.length; index += 1) crumbs.push({ label: relative[index]!, path: `${rootPath}/${relative.slice(0, index + 1).join("/")}` });
  if (currentDisplayName) crumbs[crumbs.length - 1]!.label = currentDisplayName;
  return <nav className="breadcrumbs" aria-label="Folder path">{crumbs.map((crumb, index) => <span key={crumb.path}>{index ? <ChevronRight size={12} /> : null}<button type="button" onClick={() => onOpen(crumb.path)}>{crumb.label}</button></span>)}</nav>;
}

function MobileBrowserControls({ folder, canHide, pending, mediaKinds, showHidden, thumbnailSize, onClose, onToggleKind, onShowHidden, onThumbnailSize, onUpdateFolder, onToggleHidden }: { folder: FolderEntry | null; canHide: boolean; pending: boolean; mediaKinds: MediaKind[]; showHidden: boolean; thumbnailSize: number; onClose: () => void; onToggleKind: (kind: MediaKind) => void; onShowHidden: (showHidden: boolean) => void; onThumbnailSize: (thumbnailSize: number) => void; onUpdateFolder: (folder: FolderEntry, patch: FolderPatch) => Promise<boolean>; onToggleHidden: (folder: FolderEntry) => Promise<void> }) {
  return (
    <aside id="browser-controls-panel" className="browser-controls-panel" role="dialog" aria-modal="true" aria-label="Browser options" tabIndex={-1}>
      <div className="browser-controls-heading"><span>Browser options</span><button className="icon-button" type="button" onClick={onClose} aria-label="Close browser options"><X size={19} /></button></div>
      <div className="browser-controls-scroll">
        <section className="browser-controls-section">
          <h2>Show in gallery</h2>
          <div className="mobile-kind-filters" role="group" aria-label="File types">
            <button type="button" className={mediaKinds.includes("image") ? "is-active" : ""} aria-pressed={mediaKinds.includes("image")} onClick={() => onToggleKind("image")}><Image size={18} /><span>Images</span></button>
            <button type="button" className={mediaKinds.includes("video") ? "is-active" : ""} aria-pressed={mediaKinds.includes("video")} onClick={() => onToggleKind("video")}><Video size={18} /><span>Videos</span></button>
          </div>
          <button className={`mobile-option-row ${showHidden ? "is-active" : ""}`} type="button" aria-pressed={showHidden} onClick={() => onShowHidden(!showHidden)}>{showHidden ? <Eye size={18} /> : <EyeOff size={18} />}<span><strong>Hidden folders</strong><small>{showHidden ? "Shown in navigation" : "Hidden from navigation"}</small></span></button>
          <label className="mobile-size-control"><span><SlidersHorizontal size={18} /><strong>Thumbnail size</strong></span><input type="range" min="120" max="280" step="20" value={thumbnailSize} onChange={(event) => onThumbnailSize(Number(event.target.value))} aria-label="Thumbnail size" /><output>{thumbnailSize}px</output></label>
        </section>
        {folder ? <section className="browser-controls-section"><h2>Current folder</h2><p className="browser-current-folder-name" title={folder.path}>{folder.displayName}</p><CurrentFolderActions expanded folder={folder} canHide={canHide} pending={pending} onUpdate={onUpdateFolder} onToggleHidden={onToggleHidden} /></section> : null}
      </div>
    </aside>
  );
}

function CurrentFolderActions({ folder, canHide, pending, expanded = false, onUpdate, onToggleHidden }: { folder: FolderEntry; canHide: boolean; pending: boolean; expanded?: boolean; onUpdate: (folder: FolderEntry, patch: FolderPatch) => Promise<boolean>; onToggleHidden: (folder: FolderEntry) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState("");
  if (editing) {
    return (
      <form className={`current-folder-alias-form ${expanded ? "is-expanded" : ""}`} aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void onUpdate(folder, { alias }).then((saved) => saved && setEditing(false)); }}>
        <input autoFocus value={alias} maxLength={160} disabled={pending} onChange={(event) => setAlias(event.target.value)} onKeyDown={(event) => event.key === "Escape" && !pending && setEditing(false)} aria-label={`Alias for ${folder.name}`} />
        <button type="submit" disabled={pending}>Save</button>
        {expanded ? <button className="secondary" type="button" disabled={pending} onClick={() => setEditing(false)}>Cancel</button> : null}
      </form>
    );
  }
  return (
    <div className={`current-folder-actions ${expanded ? "is-expanded" : ""}`} role="group" aria-label="Current folder actions" aria-busy={pending}>
      <button type="button" disabled={pending} className={folder.favorite ? "is-favorite" : ""} aria-pressed={folder.favorite} onClick={() => void onUpdate(folder, { favorite: !folder.favorite })} title={folder.favorite ? "Remove current folder from favorites" : "Add current folder to favorites"} aria-label={folder.favorite ? "Remove current folder from favorites" : "Add current folder to favorites"}><Star size={expanded ? 17 : 13} fill={folder.favorite ? "currentColor" : "none"} />{expanded ? <span>{folder.favorite ? "Favorited" : "Favorite"}</span> : null}</button>
      <button type="button" disabled={pending} onClick={() => { setAlias(folder.displayName === folder.name ? "" : folder.displayName); setEditing(true); }} title="Edit current folder alias" aria-label="Edit current folder alias"><Pencil size={expanded ? 17 : 13} />{expanded ? <span>Edit alias</span> : null}</button>
      <button type="button" className={folder.hidden ? "is-hidden" : ""} disabled={pending || (!canHide && !folder.hidden)} aria-pressed={folder.hidden} onClick={() => void onToggleHidden(folder)} title={!canHide && !folder.hidden ? "The media root cannot be hidden here" : folder.hidden ? "Unhide current folder" : "Hide current folder"} aria-label={folder.hidden ? "Unhide current folder" : "Hide current folder"}>{folder.hidden ? <Eye size={expanded ? 17 : 13} /> : <EyeOff size={expanded ? 17 : 13} />}{expanded ? <span>{folder.hidden ? "Unhide" : "Hide"}</span> : null}</button>
    </div>
  );
}

function FolderGrid({ folders, pendingPaths, onOpen, onUpdate }: { folders: FolderEntry[]; pendingPaths: Set<string>; onOpen: (path: string) => void; onUpdate: (folder: FolderEntry, patch: FolderPatch) => Promise<boolean> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  return (
    <section className="folder-grid" aria-label="Folders in this directory">
      {folders.map((folder) => {
        const pending = pendingPaths.has(folder.path);
        return (
          <div className={`folder-item ${folder.hidden ? "is-hidden" : ""}`} key={folder.path} aria-busy={pending}>
            <button type="button" className="folder-open" onClick={() => onOpen(folder.path)} title={folder.path}><Folder size={15} fill="currentColor" fillOpacity={0.08} /><span className="truncate">{folder.displayName}</span></button>
            {editing === folder.path ? <form className="folder-alias-form" onSubmit={(event) => { event.preventDefault(); void onUpdate(folder, { alias }).then((saved) => saved && setEditing(null)); }}><input autoFocus value={alias} maxLength={160} disabled={pending} onChange={(event) => setAlias(event.target.value)} onKeyDown={(event) => event.key === "Escape" && !pending && setEditing(null)} aria-label={`Alias for ${folder.name}`} /><button type="submit" disabled={pending}>Save</button></form> : (
              <span className="folder-actions">
                <button type="button" disabled={pending} className={folder.favorite ? "is-favorite" : ""} aria-pressed={folder.favorite} onClick={() => void onUpdate(folder, { favorite: !folder.favorite })} title={folder.favorite ? "Remove favorite" : "Favorite"} aria-label={folder.favorite ? "Remove favorite" : "Favorite"}><Star size={12} fill={folder.favorite ? "currentColor" : "none"} /></button>
                <button type="button" disabled={pending} onClick={() => { setEditing(folder.path); setAlias(folder.displayName === folder.name ? "" : folder.displayName); }} title="Edit alias" aria-label="Edit alias"><Pencil size={12} /></button>
                <button type="button" disabled={pending} className={folder.hidden ? "is-hidden" : ""} onClick={() => void onUpdate(folder, { hidden: !folder.hidden })} title={folder.hidden ? "Unhide folder" : "Hide folder subtree"} aria-label={folder.hidden ? "Unhide folder" : "Hide folder"}>{folder.hidden ? <Eye size={12} /> : <EyeOff size={12} />}</button>
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

function parentFolderPath(folderPath: string, rootPath: string) {
  if (folderPath === rootPath) return null;
  const parentPath = folderPath.slice(0, folderPath.lastIndexOf("/")) || "/";
  return parentPath.startsWith(rootPath) ? parentPath : rootPath;
}

function VirtualGallery({ media, size, activeList, pendingPaths, hasMore, loading, onLoadMore, onOpen, onStatus }: { media: MediaEntry[]; size: number; activeList: boolean; pendingPaths: Set<string>; hasMore: boolean; loading: boolean; onLoadMore: () => void; onOpen: (index: number) => void; onStatus: (item: MediaEntry, status: ListItemStatus | null) => void }) {
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
              return <MediaTile key={item.path} media={item} size={size} activeList={activeList} classificationPending={pendingPaths.has(item.path)} onOpen={() => onOpen(itemIndex)} onStatus={(status) => onStatus(item, status)} />;
            })}
          </div>
        ))}
        {hasMore ? <button className="load-more" style={{ top: virtualizer.getTotalSize() }} type="button" disabled={loading} onClick={onLoadMore}>{loading ? "Loading…" : "Load more"}</button> : null}
      </div>
    </div>
  );
}

type FolderPatch = { alias?: string | null; favorite?: boolean; hidden?: boolean };

type LoadMoreResult = { added: number; applied: boolean; hasMore: boolean };

function patchFolder(folder: FolderEntry, patch: FolderPatch): FolderEntry {
  return {
    ...folder,
    ...(patch.alias === undefined ? {} : { displayName: patch.alias?.trim() || folder.name }),
    ...(patch.favorite === undefined ? {} : { favorite: patch.favorite }),
    ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
  };
}

function findBrowseFolder(response: BrowseResponse | null, folderPath: string) {
  if (!response) return undefined;
  if (response.currentFolder.path === folderPath) return response.currentFolder;
  return response.folders.find((folder) => folder.path === folderPath);
}

function applyFolderPatchToBrowse(response: BrowseResponse, folderPath: string, patch: FolderPatch, showHidden: boolean, searchFilter: string): BrowseResponse {
  if (response.currentFolder.path === folderPath) {
    return { ...response, currentFolder: patchFolder(response.currentFolder, patch) };
  }
  if (!response.folders.some((folder) => folder.path === folderPath)) return response;
  const folders = response.folders
    .map((folder) => folder.path === folderPath ? patchFolder(folder, patch) : folder)
    .filter((folder) => (showHidden || !folder.hidden) && folderMatchesSearch(folder, searchFilter))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true }));
  return { ...response, folders };
}

function folderMatchesSearch(folder: FolderEntry, searchFilter: string) {
  const normalized = searchFilter.trim().toLowerCase();
  return !normalized || folder.name.toLowerCase().includes(normalized) || folder.displayName.toLowerCase().includes(normalized);
}

function restoreBrowseFolder(response: BrowseResponse, folder: FolderEntry, showHidden: boolean, searchFilter: string): BrowseResponse {
  if (response.currentFolder.path === folder.path) return { ...response, currentFolder: folder };
  const existing = response.folders.some((entry) => entry.path === folder.path);
  const folders = (existing
    ? response.folders.map((entry) => entry.path === folder.path ? folder : entry)
    : [...response.folders, folder]
  )
    .filter((entry) => (showHidden || !entry.hidden) && folderMatchesSearch(entry, searchFilter))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true }));
  return { ...response, folders };
}

function applyOptimisticState(response: BrowseResponse, folderPatches: Map<string, FolderPatch>, mediaStatuses: Map<string, ListItemStatus | null>, showHidden: boolean, searchFilter: string) {
  let next = response;
  for (const [folderPath, patch] of folderPatches) next = applyFolderPatchToBrowse(next, folderPath, patch, showHidden, searchFilter);
  if (mediaStatuses.size) {
    next = { ...next, media: next.media.map((entry) => mediaStatuses.has(entry.path) ? { ...entry, status: mediaStatuses.get(entry.path)! } : entry) };
  }
  return next;
}

function reconcileOptimisticState(response: BrowseResponse, folderPatches: Map<string, FolderPatch>, mediaStatuses: Map<string, ListItemStatus | null>, showHidden: boolean, searchFilter: string) {
  for (const [folderPath, patch] of folderPatches) {
    const folder = findBrowseFolder(response, folderPath);
    const hiddenFolderOmitted = patch.hidden === true && !showHidden && response.currentFolder.path !== folderPath && !folder;
    const renamedFolderOmitted = patch.alias !== undefined && Boolean(searchFilter.trim()) && response.currentFolder.path !== folderPath && !folder;
    if (hiddenFolderOmitted || renamedFolderOmitted || (folder && folderMatchesPatch(folder, patch))) folderPatches.delete(folderPath);
  }
  for (const [mediaPath, status] of mediaStatuses) {
    if (response.media.some((entry) => entry.path === mediaPath && entry.status === status)) mediaStatuses.delete(mediaPath);
  }
}

function folderMatchesPatch(folder: FolderEntry, patch: FolderPatch) {
  if (patch.alias !== undefined && folder.displayName !== (patch.alias?.trim() || folder.name)) return false;
  if (patch.favorite !== undefined && folder.favorite !== patch.favorite) return false;
  if (patch.hidden !== undefined && folder.hidden !== patch.hidden) return false;
  return true;
}
