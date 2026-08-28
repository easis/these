import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Ellipsis, Eye, EyeOff, Folder, FolderPlus, Grid2X2, Image, Library, PanelLeftClose, PanelRightClose, Pencil, Rows2, Search, SlidersHorizontal, Star, Video, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { BrowseResponse, FolderEntry, FolderMetadata, ListItemStatus, MediaEntry, MediaKind } from "@these/shared";
import { FolderTree } from "../components/FolderTree";
import { FolderCollectionsDialog } from "../components/FolderCollectionsDialog";
import { applyFolderPatch, FolderActionMenu, type FolderActionMenuClasses, type FolderPatch } from "../components/FolderActionMenu";
import { ListSidebar } from "../components/ListSidebar";
import { MediaTile } from "../components/MediaTile";
import { TextInputDialog } from "../components/TextInputDialog";
import { Viewer } from "../components/Viewer";
import { api, isAbortError, query } from "../lib/api";
import { cx } from "../lib/cx";
import { useApp } from "../state/app-context";
import ui from "../styles/ui.module.css";
import styles from "./BrowsePage.module.css";
import { browseUrl, useCollectionScope } from "./useCollectionScope";

const compactViewportQuery = "(max-width: 720px) or ((max-width: 900px) and (max-height: 500px))";
const panelFocusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const browseFolderMenuClasses: FolderActionMenuClasses = {
  control: styles.folderMenuControl,
  controlOpen: styles.folderMenuControlOpen,
  trigger: styles.folderMenuTrigger,
  open: styles.open,
  menu: styles.folderMenu,
  above: styles.above,
};

function isCompactViewport() {
  return typeof matchMedia === "function" && matchMedia(compactViewportQuery).matches;
}

export function BrowsePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { bootstrap, activeList, preferences, setPreferences, setItemStatus, removeItem, refresh } = useApp();
  const pathParameter = new URLSearchParams(location.search).get("path");
  const collectionScope = useCollectionScope({ search: location.search, navigate, preferences, setPreferences });
  const requestedPath = collectionScope.collectionId !== null
    ? collectionScope.requestedPath
    : pathParameter ?? preferences.lastFolder ?? bootstrap?.roots.find((root) => root.available)?.path ?? null;
  const [response, setResponse] = useState<BrowseResponse | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [classificationAnnouncement, setClassificationAnnouncement] = useState("");
  const [aliasFolder, setAliasFolder] = useState<{ folder: FolderEntry; onUpdated?: (alias: string | null) => void } | null>(null);
  const [collectionsFolder, setCollectionsFolder] = useState<FolderEntry | null>(null);
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
  const searchInput = useRef<HTMLInputElement>(null);
  const galleryScroll = useRef<HTMLDivElement>(null);
  const pendingPanelFocus = useRef<"folders" | "lists" | "controls" | null>(null);
  const activeFolderView = useRef({ filter, showHidden: preferences.showHidden });
  const lastFolderRef = useRef(preferences.lastFolder);
  const collectionLastFoldersRef = useRef(preferences.collectionLastFolders ?? {});
  const kinds = mediaKinds.join(",");
  const loading = browseLoading || loadingMore || (collectionScope.collectionId !== null && collectionScope.loading);
  const gallerySize = compactViewport ? (preferences.mobileGalleryDensity === "compact" ? 160 : 280) : preferences.thumbnailSize;
  const error = mutationError ?? requestError ?? collectionScope.error;
  currentActiveListId.current = activeList?.id ?? null;
  responseRef.current = response;
  activeFolderView.current = { filter, showHidden: preferences.showHidden };
  lastFolderRef.current = preferences.lastFolder;
  collectionLastFoldersRef.current = preferences.collectionLastFolders ?? {};

  useEffect(() => {
    if (location.search === "" && collectionScope.collectionId === null && requestedPath) {
      navigate(browseUrl(requestedPath), { replace: true });
    }
  }, [collectionScope.collectionId, location.search, navigate, requestedPath]);

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
    const shell = panel.closest("[data-app-shell]");
    const shellSiblings = shell
      ? Array.from(shell.children).filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(panel))
      : [];
    const siblingInertState = shellSiblings.map((element) => [element, element.hasAttribute("inert")] as const);
    for (const element of shellSiblings) element.setAttribute("inert", "");
    const getFocusable = () => Array.from(panel.querySelectorAll<HTMLElement>(panelFocusableSelector));
    if (!panel.contains(document.activeElement)) (getFocusable()[0] ?? panel).focus();
    const containPanelFocus = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
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
    setLoadMoreFailed(false);
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
        if (collectionScope.collectionId !== null) {
          if (collectionLastFoldersRef.current[String(collectionScope.collectionId)] !== requestedPath) setPreferences({
            activeCollectionId: collectionScope.collectionId,
            collectionLastFolders: { ...collectionLastFoldersRef.current, [String(collectionScope.collectionId)]: requestedPath },
          });
        } else if (lastFolderRef.current !== requestedPath) {
          setPreferences({ lastFolder: requestedPath });
        }
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
  }, [activeList?.id, collectionScope.collectionId, filter, kinds, preferences.showHidden, reloadVersion, requestedPath, setPreferences]);

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
    setRequestError(null);
    setLoadMoreFailed(false);
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
        setLoadMoreFailed(false);
        return { added, applied: true, hasMore: cursor.hasMore };
      } catch (caught) {
        if (sequence === requestSequence.current && !isAbortError(caught)) {
          setRequestError(caught instanceof Error ? caught.message : "Could not load more media.");
          setLoadMoreFailed(true);
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
      setClassificationAnnouncement(status ? `${item.name} marked ${status}.` : `${item.name} classification removed.`);
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

  const openFolder = (folderPath: string) => navigate(browseUrl(folderPath, collectionScope.collectionId));
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
    setMutationError(null);
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
      if (collectionScope.collectionId !== null) collectionScope.refreshCollectionScope();
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
    const navigationRoot = collectionScope.scopeRoot?.path ?? response.root.path;
    const parentPath = parentFolderPath(folder.path, navigationRoot);
    if (parentPath) openFolder(parentPath);
    else if (collectionScope.collectionId !== null) {
      const fallback = collectionScope.visibleFolders.find((candidate) => candidate.path !== navigationRoot && !isSameOrDescendantPath(candidate.path, folder.path));
      navigate(browseUrl(fallback?.path ?? null, collectionScope.collectionId), { replace: true });
    }
  };
  const editAlias = (folder: FolderEntry, onUpdated?: (alias: string | null) => void) => {
    setMutationError(null);
    setAliasFolder({ folder, onUpdated });
  };

  return (
    <div className={styles.browserLayout}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{classificationAnnouncement}</p>
      {preferences.leftSidebarOpen ? <FolderTree currentPath={response?.path ?? requestedPath} currentFolder={response?.currentFolder} hiddenOverrides={folderHiddenOverrides} modal={mobilePanel === "folders"} activeCollectionId={collectionScope.collectionId} collections={collectionScope.collections} collection={collectionScope.activeCollection} collectionLoading={collectionScope.loading} onCollectionChange={(collectionId) => collectionScope.selectCollection(collectionId, response?.path ?? requestedPath)} onRequestCollections={collectionScope.requestCollections} onClose={closeFolderPanelWithFocus} onNavigate={closeFolderAfterNavigation} onUpdateFolder={updateFolder} onEditAlias={editAlias} onEditCollections={setCollectionsFolder} /> : null}
      <section className={styles.galleryPanel} inert={Boolean(mobilePanel)}>
        <div className={styles.galleryToolbar}>
          {!preferences.leftSidebarOpen ? <button ref={folderSidebarTrigger} className={cx(ui.iconButton, styles.browserNavigationButton)} type="button" onClick={() => { setMobileControlsOpen(false); setPreferences({ leftSidebarOpen: true, ...(compactViewport ? { rightSidebarOpen: false } : {}) }); }} aria-controls="folder-sidebar" aria-expanded="false" aria-label="Show folder sidebar"><PanelLeftClose className="rotate-180" size={15} /></button> : null}
          <Breadcrumbs currentPath={response?.path ?? requestedPath} rootPath={collectionScope.scopeRoot?.path ?? response?.root.path} rootDisplayName={collectionScope.scopeRoot?.displayName} currentDisplayName={response?.currentFolder.displayName} onOpen={openFolder} />
          <span className="ml-auto" />
          {!preferences.rightSidebarOpen ? <button ref={listSidebarTrigger} className={cx(ui.iconButton, styles.browserNavigationButton)} type="button" onClick={() => { setMobileControlsOpen(false); setPreferences({ rightSidebarOpen: true, ...(compactViewport ? { leftSidebarOpen: false } : {}) }); }} aria-controls="list-sidebar" aria-expanded="false" aria-label="Show lists sidebar"><PanelRightClose className="rotate-180" size={15} /></button> : null}
          {response?.currentFolder && !compactViewport ? <span className={styles.desktopCurrentFolderActions}><CurrentFolderActions folder={response.currentFolder} canHide={response.path !== response.root.path} pending={pendingFolderPaths.has(response.currentFolder.path)} onUpdate={updateFolder} onToggleHidden={toggleCurrentHidden} onEditAlias={editAlias} onEditCollections={setCollectionsFolder} /></span> : null}
        </div>
        <div className={styles.gallerySubtoolbar}>
          {preferences.leftSidebarOpen && !compactViewport ? <button className={cx(ui.iconButton, styles.desktopBrowserControl)} type="button" onClick={() => closeFolderPanel(false)} aria-controls="folder-sidebar" aria-expanded="true" title="Collapse folders" aria-label="Collapse folders"><PanelLeftClose size={15} /></button> : null}
          <div className={cx(ui.searchControl, styles.gallerySearch)} role="search"><Search size={14} /><input ref={searchInput} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search files and folders" aria-label="Search files and folders" />{filter ? <button className={cx(ui.searchClear, styles.gallerySearchClear)} type="button" onClick={() => setFilter("")} aria-label="Clear search"><X size={13} /></button> : null}</div>
          {compactViewport ? <button className={cx(ui.iconButton, styles.mobileBrowserControl, styles.mobileDensityButton)} type="button" aria-label={`Use ${preferences.mobileGalleryDensity === "compact" ? "comfortable" : "compact"} gallery density`} title={`Gallery density: ${preferences.mobileGalleryDensity}`} onClick={() => setPreferences({ mobileGalleryDensity: preferences.mobileGalleryDensity === "compact" ? "comfortable" : "compact" })}>{preferences.mobileGalleryDensity === "compact" ? <Grid2X2 size={18} /> : <Rows2 size={19} />}</button> : null}
          {!compactViewport ? <div className={cx(styles.mediaKindFilters, styles.desktopBrowserControl)} role="group" aria-label="File types">
            <button type="button" className={mediaKinds.includes("image") ? styles.active : undefined} aria-pressed={mediaKinds.includes("image")} onClick={() => toggleMediaKind("image")}><Image size={13} />Images</button>
            <button type="button" className={mediaKinds.includes("video") ? styles.active : undefined} aria-pressed={mediaKinds.includes("video")} onClick={() => toggleMediaKind("video")}><Video size={13} />Videos</button>
          </div> : null}
          {!compactViewport ? <button className={cx(styles.showHiddenToggle, styles.desktopBrowserControl, preferences.showHidden && styles.active)} type="button" aria-pressed={preferences.showHidden} onClick={() => setPreferences({ showHidden: !preferences.showHidden })} title={preferences.showHidden ? "Hide hidden folders" : "Show hidden folders"}>
            {preferences.showHidden ? <Eye size={14} /> : <EyeOff size={14} />}<span>{preferences.showHidden ? "Hidden shown" : "Show hidden"}</span>
          </button> : null}
          {!compactViewport ? <span className={cx(styles.desktopBrowserControl, "ml-auto text-xs tabular-nums text-muted")}>{response ? `${response.totalMedia} media · ${response.folders.length} folders` : ""}</span> : null}
          {!compactViewport ? <label className={cx(styles.sizeControl, styles.desktopBrowserControl)} title="Thumbnail size"><SlidersHorizontal size={14} /><input type="range" min="120" max="280" step="20" value={preferences.thumbnailSize} onChange={(event) => setPreferences({ thumbnailSize: Number(event.target.value) })} aria-label="Thumbnail size" /></label> : null}
          {preferences.rightSidebarOpen && !compactViewport ? <button className={cx(ui.iconButton, styles.desktopBrowserControl)} type="button" onClick={() => closeListPanel(false)} aria-controls="list-sidebar" aria-expanded="true" title="Collapse lists" aria-label="Collapse lists"><PanelRightClose size={15} /></button> : null}
          {compactViewport ? <button ref={mobileControlsTrigger} className={cx(ui.iconButton, styles.mobileBrowserControl, styles.mobileMoreButton)} type="button" onClick={() => { setPreferences({ leftSidebarOpen: false, rightSidebarOpen: false }); setMobileControlsOpen(true); }} aria-controls="browser-controls-panel" aria-expanded={mobileControlsOpen} aria-label="Show browser options"><Ellipsis size={20} /></button> : null}
        </div>
        {error && !aliasFolder ? <div className={ui.inlineError}>{error}</div> : null}
        <div ref={galleryScroll} className={styles.galleryScroll} aria-busy={loading} data-gallery-scroll>
          {response?.folders.length ? <FolderGrid folders={response.folders} pendingPaths={pendingFolderPaths} onOpen={openFolder} onUpdate={updateFolder} onEditAlias={editAlias} onEditCollections={setCollectionsFolder} /> : null}
          {media.length ? <VirtualGallery scrollElementRef={galleryScroll} folderCount={response?.folders.length ?? 0} media={media} size={gallerySize} activeList={Boolean(activeList)} pendingPaths={pendingMediaPaths} hasMore={Boolean(response?.hasMore)} loading={loading} loadingMore={loadingMore} loadMoreFailed={loadMoreFailed} loadMoreKey={`${requestSequence.current}:${response?.path ?? ""}:${response?.offset ?? 0}:${media.length}`} onLoadMore={loadMore} onOpen={openViewer} onStatus={classify} />
            : collectionScope.collectionId !== null && !collectionScope.loading && collectionScope.activeCollection && collectionScope.visibleFolders.length === 0 ? <CollectionEmptyState collection={collectionScope.activeCollection} />
              : loading && !response ? <div className={styles.emptyGallery}>Opening folder…</div>
              : filter && response?.folders.length === 0 ? <div className={styles.emptyGallery}>No files or folders match this search.</div>
                : response?.folders.length === 0 ? <div className={styles.emptyGallery}>{mediaKinds.length === 1 ? `No ${mediaKinds[0] === "image" ? "images" : "videos"} in this folder.` : "No media in this folder."}</div>
                  : null}
        </div>
      </section>
      {preferences.rightSidebarOpen ? <ListSidebar modal={mobilePanel === "lists"} onClose={closeListPanelWithFocus} onSelection={closeListAfterSelection} /> : null}
      {compactViewport && mobileControlsOpen ? <MobileBrowserControls folder={response?.currentFolder ?? null} canHide={Boolean(response && response.path !== response.root.path)} pending={Boolean(response && pendingFolderPaths.has(response.currentFolder.path))} mediaKinds={mediaKinds} showHidden={preferences.showHidden} density={preferences.mobileGalleryDensity} onClose={() => { pendingPanelFocus.current = "controls"; setMobileControlsOpen(false); }} onToggleKind={toggleMediaKind} onShowHidden={(showHidden) => setPreferences({ showHidden })} onDensity={(mobileGalleryDensity) => setPreferences({ mobileGalleryDensity })} onUpdateFolder={updateFolder} onToggleHidden={toggleCurrentHidden} onEditAlias={editAlias} onEditCollections={setCollectionsFolder} /> : null}
      {mobilePanel ? <button className={styles.panelBackdrop} type="button" tabIndex={-1} onClick={closeOpenMobilePanel} aria-label="Close navigation panel" /> : null}
      {aliasFolder ? <TextInputDialog title="Edit folder alias" label={`Alias for ${aliasFolder.folder.name}`} initialValue={aliasFolder.folder.displayName === aliasFolder.folder.name ? "" : aliasFolder.folder.displayName} description="Leave this empty to use the folder name." maxLength={160} submitLabel="Save alias" allowEmpty error={mutationError} fallbackFocusRef={searchInput} onValueChange={() => setMutationError(null)} onSubmit={async (alias) => { const updated = await updateFolder(aliasFolder.folder, { alias }); if (updated) aliasFolder.onUpdated?.(alias || null); return updated; }} onClose={() => { setAliasFolder(null); setMutationError(null); }} /> : null}
      {collectionsFolder ? <FolderCollectionsDialog folder={collectionsFolder} onSaved={collectionScope.refreshCollectionScope} onClose={() => setCollectionsFolder(null)} /> : null}
      {viewerIndex !== null ? <Viewer items={media} index={viewerIndex} classificationContext={activeList?.name ?? null} classificationEnabled={Boolean(activeList)} classificationPending={pendingMediaPaths.has(media[viewerIndex]?.path ?? "")} hasNext={viewerIndex < media.length - 1 || Boolean(response?.hasMore)} nextPending={viewerAdvancePending} onIndex={setViewerIndex} onNext={() => void advanceViewer()} onClose={closeViewer} onStatus={(status) => void classify(media[viewerIndex]!, status)} /> : null}
    </div>
  );
}

function Breadcrumbs({ currentPath, rootPath, rootDisplayName, currentDisplayName, onOpen }: { currentPath: string | null; rootPath?: string; rootDisplayName?: string; currentDisplayName?: string; onOpen: (path: string) => void }) {
  if (!currentPath || !rootPath) return <span className="text-xs text-muted">No folder</span>;
  const relative = currentPath.slice(rootPath.length).split("/").filter(Boolean);
  const crumbs = [{ label: rootDisplayName ?? rootPath.split("/").pop() ?? rootPath, path: rootPath }];
  for (let index = 0; index < relative.length; index += 1) crumbs.push({ label: relative[index]!, path: `${rootPath}/${relative.slice(0, index + 1).join("/")}` });
  if (currentDisplayName) crumbs[crumbs.length - 1]!.label = currentDisplayName;
  return <nav className={styles.breadcrumbs} aria-label="Folder path">{crumbs.map((crumb, index) => <span key={crumb.path}>{index ? <ChevronRight size={12} /> : null}<button type="button" onClick={() => onOpen(crumb.path)}>{crumb.label}</button></span>)}</nav>;
}

function CollectionEmptyState({ collection }: { collection: NonNullable<ReturnType<typeof useCollectionScope>["activeCollection"]> }) {
  const readyFolders = collection.folders.filter((folder) => folder.status === "ready");
  const title = collection.folders.length === 0 ? "This collection is empty"
    : readyFolders.length === 0 ? "No folders are available"
      : "No visible folders";
  const description = collection.folders.length === 0
    ? `Add folders to ${collection.name} while browsing, then return here to work inside it.`
    : readyFolders.length === 0
      ? `Reconnect the media source or update ${collection.name} to continue browsing.`
      : `Enable hidden folders to browse ${collection.name}.`;
  return <div className={styles.collectionEmptyGallery}>
    <Library size={24} />
    <h2>{title}</h2>
    <p>{description}</p>
    <Link className={ui.compactButton} to={`/collections/${collection.id}`}>Manage collection</Link>
  </div>;
}

function MobileBrowserControls({ folder, canHide, pending, mediaKinds, showHidden, density, onClose, onToggleKind, onShowHidden, onDensity, onUpdateFolder, onToggleHidden, onEditAlias, onEditCollections }: { folder: FolderEntry | null; canHide: boolean; pending: boolean; mediaKinds: MediaKind[]; showHidden: boolean; density: "compact" | "comfortable"; onClose: () => void; onToggleKind: (kind: MediaKind) => void; onShowHidden: (showHidden: boolean) => void; onDensity: (density: "compact" | "comfortable") => void; onUpdateFolder: (folder: FolderEntry, patch: FolderPatch) => Promise<boolean>; onToggleHidden: (folder: FolderEntry) => Promise<void>; onEditAlias: (folder: FolderEntry) => void; onEditCollections: (folder: FolderEntry) => void }) {
  return (
    <aside id="browser-controls-panel" className={styles.browserControlsPanel} role="dialog" aria-modal="true" aria-label="Browser options" tabIndex={-1}>
      <div className={styles.browserControlsHeading}><span>Browser options</span><button className={cx(ui.iconButton, styles.browserControlsClose)} type="button" onClick={onClose} aria-label="Close browser options"><X size={19} /></button></div>
      <div className={styles.browserControlsScroll}>
        <section className={styles.browserControlsSection}>
          <h2>Show in gallery</h2>
          <div className={styles.mobileKindFilters} role="group" aria-label="File types">
            <button type="button" className={mediaKinds.includes("image") ? styles.active : undefined} aria-pressed={mediaKinds.includes("image")} onClick={() => onToggleKind("image")}><Image size={18} /><span>Images</span></button>
            <button type="button" className={mediaKinds.includes("video") ? styles.active : undefined} aria-pressed={mediaKinds.includes("video")} onClick={() => onToggleKind("video")}><Video size={18} /><span>Videos</span></button>
          </div>
          <button className={cx(styles.mobileOptionRow, showHidden && styles.active)} type="button" aria-pressed={showHidden} onClick={() => onShowHidden(!showHidden)}>{showHidden ? <Eye size={18} /> : <EyeOff size={18} />}<span><strong>Hidden folders</strong><small>{showHidden ? "Shown in navigation" : "Hidden from navigation"}</small></span></button>
          <div className={styles.mobileDensityControl}><span><Grid2X2 size={18} /><strong>Gallery density</strong></span><div role="group" aria-label="Mobile gallery density"><button type="button" className={density === "compact" ? styles.active : undefined} aria-pressed={density === "compact"} onClick={() => onDensity("compact")}>Compact</button><button type="button" className={density === "comfortable" ? styles.active : undefined} aria-pressed={density === "comfortable"} onClick={() => onDensity("comfortable")}>Comfortable</button></div></div>
        </section>
        {folder ? <section className={styles.browserControlsSection}><h2>Current folder</h2><p className={styles.currentFolderName} title={folder.path}>{folder.displayName}</p><CurrentFolderActions expanded folder={folder} canHide={canHide} pending={pending} onUpdate={onUpdateFolder} onToggleHidden={onToggleHidden} onEditAlias={onEditAlias} onEditCollections={onEditCollections} /></section> : null}
      </div>
    </aside>
  );
}

function CurrentFolderActions({ folder, canHide, pending, expanded = false, onUpdate, onToggleHidden, onEditAlias, onEditCollections }: { folder: FolderEntry; canHide: boolean; pending: boolean; expanded?: boolean; onUpdate: (folder: FolderEntry, patch: FolderPatch) => Promise<boolean>; onToggleHidden: (folder: FolderEntry) => Promise<void>; onEditAlias: (folder: FolderEntry) => void; onEditCollections: (folder: FolderEntry) => void }) {
  return (
    <div className={cx(styles.currentFolderActions, expanded && styles.expanded)} role="group" aria-label="Current folder actions" aria-busy={pending}>
      <button type="button" disabled={pending} className={folder.favorite ? styles.favorite : undefined} aria-pressed={folder.favorite} onClick={() => void onUpdate(folder, { favorite: !folder.favorite })} title={folder.favorite ? "Remove current folder from favorites" : "Add current folder to favorites"} aria-label={folder.favorite ? "Remove current folder from favorites" : "Add current folder to favorites"}><Star size={expanded ? 17 : 13} fill={folder.favorite ? "currentColor" : "none"} />{expanded ? <span>{folder.favorite ? "Favorited" : "Favorite"}</span> : null}</button>
      <button type="button" disabled={pending} onClick={() => onEditAlias(folder)} title="Edit current folder alias" aria-label="Edit current folder alias"><Pencil size={expanded ? 17 : 13} />{expanded ? <span>Edit alias</span> : null}</button>
      <button type="button" disabled={pending} onClick={() => onEditCollections(folder)} title="Add current folder to collections" aria-label="Add current folder to collections"><FolderPlus size={expanded ? 17 : 13} />{expanded ? <span>Collections</span> : null}</button>
      <button type="button" className={folder.hidden ? styles.hidden : undefined} disabled={pending || (!canHide && !folder.hidden)} aria-pressed={folder.hidden} onClick={() => void onToggleHidden(folder)} title={!canHide && !folder.hidden ? "The media root cannot be hidden here" : folder.hidden ? "Unhide current folder" : "Hide current folder"} aria-label={folder.hidden ? "Unhide current folder" : "Hide current folder"}>{folder.hidden ? <Eye size={expanded ? 17 : 13} /> : <EyeOff size={expanded ? 17 : 13} />}{expanded ? <span>{folder.hidden ? "Unhide" : "Hide"}</span> : null}</button>
    </div>
  );
}

function FolderGrid({ folders, pendingPaths, onOpen, onUpdate, onEditAlias, onEditCollections }: { folders: FolderEntry[]; pendingPaths: Set<string>; onOpen: (path: string) => void; onUpdate: (folder: FolderEntry, patch: FolderPatch) => Promise<boolean>; onEditAlias: (folder: FolderEntry) => void; onEditCollections: (folder: FolderEntry) => void }) {
  const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
  return (
    <section className={styles.folderGrid} aria-label="Folders in this directory">
      {folders.map((folder) => {
        const pending = pendingPaths.has(folder.path);
        return (
          <div className={cx(styles.folderItem, folder.hidden && styles.hidden)} key={folder.path} aria-busy={pending}>
            <button type="button" className={styles.folderOpen} onClick={() => onOpen(folder.path)} title={folder.path} aria-label={folder.displayName}>
              <Folder size={17} fill="currentColor" fillOpacity={0.08} />
              <span className="truncate">{folder.displayName}</span>
              {folder.favorite || folder.hidden ? <span className={styles.folderStatuses} aria-hidden="true">
                {folder.favorite ? <Star className={styles.favorite} size={13} fill="currentColor" /> : null}
                {folder.hidden ? <EyeOff className={styles.hidden} size={13} /> : null}
              </span> : null}
            </button>
            <FolderActionMenu
              folder={folder}
              pending={pending}
              open={openMenuPath === folder.path}
              classes={browseFolderMenuClasses}
              boundarySelector="[data-gallery-scroll]"
              onOpenChange={(open) => setOpenMenuPath(open ? folder.path : null)}
              onUpdate={onUpdate}
              onEditAlias={onEditAlias}
              onEditCollections={onEditCollections}
            />
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

function isSameOrDescendantPath(folderPath: string, ancestorPath: string) {
  if (folderPath === ancestorPath) return true;
  if (ancestorPath.endsWith("/") || ancestorPath.endsWith("\\")) return folderPath.startsWith(ancestorPath);
  return folderPath.startsWith(`${ancestorPath}/`) || folderPath.startsWith(`${ancestorPath}\\`);
}

function VirtualGallery({ scrollElementRef, folderCount, media, size, activeList, pendingPaths, hasMore, loading, loadingMore, loadMoreFailed, loadMoreKey, onLoadMore, onOpen, onStatus }: { scrollElementRef: RefObject<HTMLDivElement | null>; folderCount: number; media: MediaEntry[]; size: number; activeList: boolean; pendingPaths: Set<string>; hasMore: boolean; loading: boolean; loadingMore: boolean; loadMoreFailed: boolean; loadMoreKey: string; onLoadMore: () => Promise<LoadMoreResult>; onOpen: (index: number) => void; onStatus: (item: MediaEntry, status: ListItemStatus | null) => void }) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const attemptedLoadKey = useRef<string | null>(null);
  const [layout, setLayout] = useState({ width: 800, scrollMargin: 0 });
  useLayoutEffect(() => {
    const gallery = galleryRef.current;
    const scrollElement = scrollElementRef.current;
    if (!gallery || !scrollElement) return;
    const measure = () => {
      const width = gallery.clientWidth || 800;
      const scrollMargin = gallery.offsetTop;
      setLayout((current) => current.width === width && current.scrollMargin === scrollMargin ? current : { width, scrollMargin });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gallery);
    observer.observe(scrollElement);
    if (gallery.previousElementSibling) observer.observe(gallery.previousElementSibling);
    return () => observer.disconnect();
  }, [folderCount, scrollElementRef]);
  const gap = 7;
  const columns = Math.max(1, Math.floor((layout.width + gap) / (size + gap)));
  const rowCount = Math.ceil(media.length / columns);
  const virtualizer = useVirtualizer({ count: rowCount, getScrollElement: () => scrollElementRef.current, estimateSize: () => size + 32 + gap, overscan: 3, scrollMargin: layout.scrollMargin });
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const scrollElement = scrollElementRef.current;
    if (!sentinel || !scrollElement || !hasMore || loading || loadMoreFailed) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || attemptedLoadKey.current === loadMoreKey) return;
      attemptedLoadKey.current = loadMoreKey;
      void onLoadMore();
    }, { root: scrollElement, rootMargin: "600px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMoreFailed, loadMoreKey, loading, onLoadMore, scrollElementRef]);
  return (
    <div ref={galleryRef} className={styles.virtualGalleryScroll}>
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize() + (hasMore ? 46 : 8)}px` }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div key={row.key} className="absolute left-0 top-0 grid w-full" style={{ transform: `translateY(${row.start - layout.scrollMargin}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: `${gap}px`, height: `${row.size - gap}px` }}>
            {media.slice(row.index * columns, row.index * columns + columns).map((item, column) => {
              const itemIndex = row.index * columns + column;
              return <MediaTile key={item.path} media={item} size={size} activeList={activeList} classificationPending={pendingPaths.has(item.path)} onOpen={() => onOpen(itemIndex)} onStatus={(status) => onStatus(item, status)} />;
            })}
          </div>
        ))}
        {hasMore ? <div ref={loadMoreSentinelRef} className={styles.loadMoreSentinel} style={{ top: virtualizer.getTotalSize() }}>
          {loadMoreFailed
            ? <button className={ui.compactButton} type="button" disabled={loading} onClick={() => void onLoadMore()}>Retry loading more</button>
            : loadingMore ? <span role="status" aria-live="polite">Loading more…</span> : <span className="sr-only">More media loads automatically as you scroll.</span>}
        </div> : null}
      </div>
    </div>
  );
}

type LoadMoreResult = { added: number; applied: boolean; hasMore: boolean };

function findBrowseFolder(response: BrowseResponse | null, folderPath: string) {
  if (!response) return undefined;
  if (response.currentFolder.path === folderPath) return response.currentFolder;
  return response.folders.find((folder) => folder.path === folderPath);
}

function applyFolderPatchToBrowse(response: BrowseResponse, folderPath: string, patch: FolderPatch, showHidden: boolean, searchFilter: string): BrowseResponse {
  if (response.currentFolder.path === folderPath) {
    return { ...response, currentFolder: applyFolderPatch(response.currentFolder, patch) };
  }
  if (!response.folders.some((folder) => folder.path === folderPath)) return response;
  const folders = response.folders
    .map((folder) => folder.path === folderPath ? applyFolderPatch(folder, patch) : folder)
    .filter((folder) => (showHidden || !folder.hidden) && folderMatchesSearch(folder, searchFilter))
    .sort(compareFolderDisplayNames);
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
    .sort(compareFolderDisplayNames);
  return { ...response, folders };
}

function compareFolderDisplayNames(a: FolderEntry, b: FolderEntry) {
  return a.displayName.localeCompare(b.displayName, undefined, { numeric: false });
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
