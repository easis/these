import { Check, ChevronDown, ChevronRight, Folder, FolderHeart, Folders, HardDrive, Library, PanelLeftClose, Settings2, WifiOff } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { BrowseResponse, CollectionFolder, FolderCollection, FolderCollectionDetail, FolderEntry } from "@these/shared";
import { applyFolderPatch, FolderActionMenu, type FolderActionMenuClasses, type FolderPatch } from "./FolderActionMenu";
import { api, isAbortError, query } from "../lib/api";
import { cx } from "../lib/cx";
import { folderSidebarWidth } from "../lib/preferences";
import { useApp } from "../state/app-context";
import ui from "../styles/ui.module.css";
import styles from "./FolderTree.module.css";
import sidebar from "./Sidebar.module.css";
import { useSidebarResize } from "./useSidebarResize";

const treeFolderMenuClasses: FolderActionMenuClasses = {
  control: styles.treeMenuControl,
  controlOpen: styles.treeMenuControlOpen,
  trigger: styles.treeMenuTrigger,
  open: styles.open,
  menu: styles.treeMenu,
  above: styles.above,
};

interface FolderTreeActions {
  onUpdateFolder?: (folder: FolderEntry, patch: FolderPatch) => Promise<boolean>;
  onEditAlias?: (folder: FolderEntry, onUpdated?: (alias: string | null) => void) => void;
  onEditCollections?: (folder: FolderEntry) => void;
}

interface TreeNodeProps {
  folder: FolderEntry;
  depth: number;
  currentPath: string | null;
  showHidden: boolean;
  hiddenOverrides: ReadonlyMap<string, boolean>;
  rootPaths: ReadonlySet<string>;
  branchId: string;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onOpen: (path: string) => void;
  actions: FolderTreeActions;
}

const TreeNode = memo(function TreeNode({ folder, depth, currentPath, showHidden, hiddenOverrides, rootPaths, branchId, openMenuId, onOpenMenu, onOpen, actions }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(currentPath?.startsWith(`${folder.path}/`) ?? false);
  const [children, setChildren] = useState<FolderEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [visibleFolder, setVisibleFolder] = useState(folder);
  const menuId = `${branchId}:${folder.path}`;
  const hidden = isEffectivelyHidden(visibleFolder.path, visibleFolder.hidden, hiddenOverrides);

  useEffect(() => {
    setVisibleFolder(folder);
  }, [folder.displayName, folder.favorite, folder.hidden, folder.name, folder.path]);

  useEffect(() => {
    if (currentPath?.startsWith(`${folder.path}/`)) setExpanded(true);
  }, [currentPath, folder.path]);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true);
    void api<BrowseResponse>(`/api/browse?${query({ path: folder.path, limit: 1, showHidden })}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setVisibleFolder(response.currentFolder);
          setChildren(response.folders);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) setChildren([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [expanded, folder.path, showHidden]);

  const updateFolder = async (_folder: FolderEntry, patch: FolderPatch) => {
    if (!actions.onUpdateFolder || pending) return false;
    const previous = visibleFolder;
    setVisibleFolder((current) => applyFolderPatch(current, patch));
    setPending(true);
    const updated = await actions.onUpdateFolder(visibleFolder, patch);
    if (!updated) setVisibleFolder(previous);
    setPending(false);
    return updated;
  };
  const editAlias = () => actions.onEditAlias?.(visibleFolder, (alias) => setVisibleFolder((current) => applyFolderPatch(current, { alias })));
  const hasActions = Boolean(actions.onUpdateFolder && actions.onEditAlias && actions.onEditCollections);

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <div className={cx(styles.treeRow, currentPath === folder.path && styles.current, hidden && styles.hidden)} style={{ paddingLeft: `${6 + depth * 14}px` }}>
        <button type="button" className={styles.treeToggle} onClick={() => setExpanded((value) => !value)} aria-label={`${expanded ? "Collapse" : "Expand"} ${visibleFolder.displayName}`}>
          <ChevronRight className={expanded ? "rotate-90" : ""} size={13} />
        </button>
        <button type="button" className={styles.treeLabel} onClick={() => onOpen(visibleFolder.path)} title={visibleFolder.path}>
          <Folder size={14} fill="currentColor" fillOpacity={0.08} />
          <span className="truncate">{visibleFolder.displayName}</span>
        </button>
        {hasActions ? <FolderActionMenu
          folder={visibleFolder}
          pending={pending}
          open={openMenuId === menuId}
          classes={treeFolderMenuClasses}
          boundarySelector="[data-folder-tree-boundary]"
          canHide={!rootPaths.has(visibleFolder.path)}
          onOpenChange={(open) => onOpenMenu(open ? menuId : null)}
          onUpdate={updateFolder}
          onEditAlias={editAlias}
          onEditCollections={(target) => actions.onEditCollections?.(target)}
        /> : null}
      </div>
      {expanded ? (
        <div role="group">
          {loading ? <div className={styles.treeNote} style={{ paddingLeft: `${28 + depth * 14}px` }}>Loading…</div> : null}
          {children?.map((child) => {
            const childHidden = isEffectivelyHidden(child.path, child.hidden, hiddenOverrides);
            return showHidden || !childHidden ? <TreeNode key={child.path} folder={child} depth={depth + 1} currentPath={currentPath} showHidden={showHidden} hiddenOverrides={hiddenOverrides} rootPaths={rootPaths} branchId={branchId} openMenuId={openMenuId} onOpenMenu={onOpenMenu} onOpen={onOpen} actions={actions} /> : null;
          })}
        </div>
      ) : null}
    </div>
  );
});

function FavoriteFolderRow({ folder, hiddenOverrides, rootPaths, menuId, openMenuId, onOpenMenu, onOpen, actions }: { folder: FolderEntry; hiddenOverrides: ReadonlyMap<string, boolean>; rootPaths: ReadonlySet<string>; menuId: string; openMenuId: string | null; onOpenMenu: (menuId: string | null) => void; onOpen: (path: string) => void; actions: FolderTreeActions }) {
  const [visibleFolder, setVisibleFolder] = useState(folder);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setVisibleFolder(folder);
  }, [folder.displayName, folder.favorite, folder.hidden, folder.name, folder.path]);

  const updateFolder = async (_folder: FolderEntry, patch: FolderPatch) => {
    if (!actions.onUpdateFolder || pending) return false;
    const previous = visibleFolder;
    setVisibleFolder((current) => applyFolderPatch(current, patch));
    setPending(true);
    const updated = await actions.onUpdateFolder(visibleFolder, patch);
    if (!updated) setVisibleFolder(previous);
    setPending(false);
    return updated;
  };
  const editAlias = () => actions.onEditAlias?.(visibleFolder, (alias) => setVisibleFolder((current) => applyFolderPatch(current, { alias })));
  if (!visibleFolder.favorite) return null;
  return (
    <div className={styles.favoriteItem}>
      <button className={cx(styles.favoriteRow, isEffectivelyHidden(visibleFolder.path, visibleFolder.hidden, hiddenOverrides) && styles.hidden)} type="button" onClick={() => onOpen(visibleFolder.path)} title={visibleFolder.path}>
        <span className="truncate">{visibleFolder.displayName}</span>
      </button>
      <FolderActionMenu
        folder={visibleFolder}
        pending={pending}
        open={openMenuId === menuId}
        classes={treeFolderMenuClasses}
        boundarySelector="[data-folder-tree-boundary]"
        canHide={!rootPaths.has(visibleFolder.path)}
        onOpenChange={(open) => onOpenMenu(open ? menuId : null)}
        onUpdate={updateFolder}
        onEditAlias={editAlias}
        onEditCollections={(target) => actions.onEditCollections?.(target)}
      />
    </div>
  );
}

const emptyHiddenOverrides = new Map<string, boolean>();

interface FolderTreeProps extends FolderTreeActions {
  currentPath: string | null;
  currentFolder?: FolderEntry;
  hiddenOverrides?: ReadonlyMap<string, boolean>;
  onClose?: () => void;
  onNavigate?: () => void;
  modal?: boolean;
  activeCollectionId?: number | null;
  collections?: FolderCollection[];
  collection?: FolderCollectionDetail | null;
  collectionLoading?: boolean;
  onCollectionChange?: (collectionId: number | null) => void;
  onRequestCollections?: () => void;
}

export function FolderTree({ currentPath, currentFolder, hiddenOverrides = emptyHiddenOverrides, onClose, onNavigate, modal = false, activeCollectionId = null, collections = [], collection = null, collectionLoading = false, onCollectionChange, onRequestCollections, onUpdateFolder, onEditAlias, onEditCollections }: FolderTreeProps) {
  const { bootstrap, preferences, setPreferences } = useApp();
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const commitWidth = useCallback((leftSidebarWidth: number) => setPreferences({ leftSidebarWidth }), [setPreferences]);
  const resize = useSidebarResize({ storedWidth: preferences.leftSidebarWidth, config: folderSidebarWidth, edge: "right", reserveForOppositeSidebar: preferences.rightSidebarOpen, onCommit: commitWidth });

  const open = useCallback((folderPath: string) => {
    navigate(`/browse?${query({ collection: activeCollectionId, path: folderPath })}`);
    onNavigate?.();
  }, [activeCollectionId, navigate, onNavigate]);
  const actions = useMemo(() => ({ onUpdateFolder, onEditAlias, onEditCollections }), [onEditAlias, onEditCollections, onUpdateFolder]);
  const hasActions = Boolean(onUpdateFolder && onEditAlias && onEditCollections);
  const rootPaths = useMemo(() => new Set(bootstrap?.roots.map((root) => root.path) ?? []), [bootstrap?.roots]);
  const visibleFavorites = bootstrap?.favorites.filter((favorite) => favorite.status === "ok" && (preferences.showHidden || !isEffectivelyHidden(favorite.path, favorite.hidden, hiddenOverrides))) ?? [];
  const collectionFolders = collection?.folders.filter((folder) => preferences.showHidden || !isEffectivelyHidden(folder.path, folder.hidden, hiddenOverrides)) ?? [];
  const activeCollectionRoot = currentPath ? mostSpecificCollectionRoot(currentPath, collectionFolders) : undefined;
  return (
    <aside ref={resize.sidebarRef} id="folder-sidebar" className={cx(sidebar.sidePanel, styles.leftPanel)} role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label="Folders" tabIndex={modal ? -1 : undefined} style={{ "--sidebar-width": `${resize.renderedWidth}px` } as CSSProperties} data-folder-tree-boundary>
      <div className={sidebar.panelHeading}>
        {onClose ? <button className={cx(ui.iconButton, sidebar.panelClose, sidebar.mobileClose, styles.folderPanelClose)} type="button" onClick={onClose} title="Close folders" aria-label="Close folders"><PanelLeftClose size={15} /></button> : null}
        <CollectionPicker activeCollectionId={activeCollectionId} collections={collections} collection={collection} loading={collectionLoading} onChange={onCollectionChange} onRequestCollections={onRequestCollections} />
      </div>
      {activeCollectionId === null && visibleFavorites.length ? (
        <section className="border-b border-default pb-2">
          <h2 className={styles.panelSectionLabel}><FolderHeart size={12} /> Favorites</h2>
          {visibleFavorites.map((favorite) => {
            const name = bootstrap?.roots.find((root) => root.path === favorite.path)?.label ?? favorite.path.split("/").filter(Boolean).at(-1) ?? favorite.path;
            const folder: FolderEntry = { path: favorite.path, name, displayName: favorite.alias ?? name, hidden: favorite.hidden, favorite: true };
            return hasActions ? <FavoriteFolderRow key={favorite.id} folder={folder} hiddenOverrides={hiddenOverrides} rootPaths={rootPaths} menuId={`favorite:${favorite.id}`} openMenuId={openMenuId} onOpenMenu={setOpenMenuId} onOpen={open} actions={actions} /> : (
              <button className={cx(styles.favoriteRow, isEffectivelyHidden(favorite.path, favorite.hidden, hiddenOverrides) && styles.hidden)} type="button" key={favorite.id} onClick={() => open(favorite.path)} title={favorite.path}>
                <span className="truncate">{folder.displayName}</span>
              </button>
            );
          })}
        </section>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="tree" aria-label={activeCollectionId === null ? "Media roots" : `${collection?.name ?? "Collection"} folders`} data-folder-tree-scroll>
        {activeCollectionId === null ? bootstrap?.roots.map((root) => {
          const folder: FolderEntry = currentFolder?.path === root.path ? currentFolder : { path: root.path, name: root.label, displayName: root.label, hidden: false, favorite: false };
          return root.available ? <TreeNode key={root.id} folder={folder} depth={0} currentPath={currentPath} showHidden={preferences.showHidden} hiddenOverrides={hiddenOverrides} rootPaths={rootPaths} branchId={root.id} openMenuId={openMenuId} onOpenMenu={setOpenMenuId} onOpen={open} actions={actions} /> : (
            <div key={root.id} className={cx(styles.treeRow, "opacity-50")} title={`${root.path} is unavailable`}><HardDrive size={14} /><span className="truncate">{root.label}</span></div>
          );
        }) : collectionFolders.map((member) => member.status === "ready" ? (
          <TreeNode
            key={member.path}
            folder={collectionFolderEntry(member, currentFolder)}
            depth={0}
            currentPath={activeCollectionRoot?.path === member.path ? currentPath : null}
            showHidden={preferences.showHidden}
            hiddenOverrides={hiddenOverrides}
            rootPaths={rootPaths}
            branchId={`collection:${activeCollectionId}:${member.path}`}
            openMenuId={openMenuId}
            onOpenMenu={setOpenMenuId}
            onOpen={open}
            actions={actions}
          />
        ) : <UnavailableCollectionFolder key={member.path} folder={member} />)}
        {activeCollectionId !== null && collectionLoading && !collection ? <div className={styles.collectionEmpty}>Loading collection…</div> : null}
        {activeCollectionId !== null && !collectionLoading && collection && collectionFolders.length === 0 ? <div className={styles.collectionEmpty}>
          <Library size={18} />
          <strong>{collection.folders.length ? "No visible folders" : "This collection is empty"}</strong>
          <span>{collection.folders.length ? "Enable hidden folders to show its members." : "Add folders while browsing or manage the collection."}</span>
          <Link to={`/collections/${collection.id}`}>Manage collection</Link>
        </div> : null}
      </div>
      {!modal ? <div ref={resize.separatorRef} className={cx(sidebar.sidebarResizer, styles.folderSidebarResizer)} role="separator" aria-label="Resize folder sidebar" aria-orientation="vertical" aria-valuemin={folderSidebarWidth.min} aria-valuemax={resize.maximumWidth} aria-valuenow={resize.renderedWidth} aria-valuetext={`${resize.renderedWidth} pixels`} tabIndex={0} title="Resize folders" onPointerDown={resize.startResize} onPointerMove={resize.continueResize} onPointerUp={resize.endResize} onPointerCancel={resize.cancelResize} onKeyDown={resize.resizeWithKeyboard} /> : null}
    </aside>
  );
}

function CollectionPicker({ activeCollectionId, collections, collection, loading, onChange, onRequestCollections }: { activeCollectionId: number | null; collections: FolderCollection[]; collection: FolderCollectionDetail | null; loading: boolean; onChange?: (collectionId: number | null) => void; onRequestCollections?: () => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialMenuFocus = useRef<"first" | "last">("first");
  const activeSummary = collection ?? collections.find((candidate) => candidate.id === activeCollectionId);
  const label = activeCollectionId === null ? "All folders" : activeSummary?.name ?? (loading ? "Loading collection…" : "Collection unavailable");

  useEffect(() => {
    if (!open) return;
    const initialItems = menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    (initialMenuFocus.current === "last" ? initialItems?.[initialItems.length - 1] : initialItems?.[0])?.focus();
    initialMenuFocus.current = "first";
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
      if (!items.length) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : event.key === "ArrowUp" ? (currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
            : currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
      items[nextIndex]?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const choose = (collectionId: number | null) => {
    triggerRef.current?.focus();
    setOpen(false);
    onChange?.(collectionId);
  };

  const toggle = () => {
    if (!open) onRequestCollections?.();
    setOpen((value) => !value);
  };

  const openWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    initialMenuFocus.current = event.key === "ArrowUp" ? "last" : "first";
    onRequestCollections?.();
    setOpen(true);
  };

  return <div ref={containerRef} className={styles.scopePicker}>
    <button ref={triggerRef} className={cx(styles.scopeTrigger, activeCollectionId !== null && styles.collectionScope)} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Folder scope: ${label}`} onClick={toggle} onKeyDown={openWithKeyboard}>
      {activeCollectionId === null ? <Folders size={14} /> : <Library size={14} />}
      <span className="truncate">{label}</span>
      {activeCollectionId !== null && activeSummary ? <small>{activeSummary.folderCount}</small> : null}
      <ChevronDown className={open ? "rotate-180" : undefined} size={13} />
    </button>
    {open ? <div ref={menuRef} className={styles.scopeMenu} role="menu" aria-label="Folder scope">
      <button type="button" role="menuitemradio" aria-checked={activeCollectionId === null} onClick={() => choose(null)}><Folders size={14} /><span><strong>All folders</strong><small>Every media root</small></span>{activeCollectionId === null ? <Check size={13} /> : null}</button>
      {loading && collections.length === 0 ? <div className={styles.scopeMenuStatus}>Loading collections…</div> : null}
      {collections.length ? <div className={styles.scopeMenuDivider} /> : null}
      {collections.map((candidate) => <button key={candidate.id} type="button" role="menuitemradio" aria-checked={activeCollectionId === candidate.id} onClick={() => choose(candidate.id)}><Library size={14} /><span><strong>{candidate.name}</strong><small>{formatFolderCount(candidate.folderCount)}</small></span>{activeCollectionId === candidate.id ? <Check size={13} /> : null}</button>)}
      <div className={styles.scopeMenuDivider} />
      <Link to="/collections" role="menuitem" onClick={() => setOpen(false)}><Settings2 size={14} /><span>Manage collections</span></Link>
    </div> : null}
  </div>;
}

function UnavailableCollectionFolder({ folder }: { folder: CollectionFolder }) {
  const status = folder.status === "root-unavailable" ? "Root unavailable" : "Folder unavailable";
  return <div className={cx(styles.treeRow, styles.unavailableMember)} role="treeitem" title={`${folder.path} — ${status}`} aria-disabled="true">
    {folder.status === "root-unavailable" ? <HardDrive size={14} /> : <WifiOff size={14} />}
    <span className="truncate">{folder.displayName}</span>
    <small>{status}</small>
  </div>;
}

function collectionFolderEntry(folder: CollectionFolder, currentFolder?: FolderEntry): FolderEntry {
  return currentFolder?.path === folder.path ? currentFolder : {
    path: folder.path,
    name: folder.name,
    displayName: folder.displayName,
    hidden: folder.hidden,
    favorite: folder.favorite,
  };
}

function mostSpecificCollectionRoot(currentPath: string, folders: CollectionFolder[]) {
  let result: CollectionFolder | undefined;
  for (const folder of folders) {
    if (folder.status !== "ready" || !isSameOrDescendantPath(currentPath, folder.path)) continue;
    if (!result || folder.path.length > result.path.length) result = folder;
  }
  return result;
}

function formatFolderCount(count: number) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "folder" : "folders"}`;
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
