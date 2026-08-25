import { ChevronRight, Folder, FolderHeart, HardDrive, PanelLeftClose } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BrowseResponse, FolderEntry } from "@these/shared";
import { api, isAbortError, query } from "../lib/api";
import { useApp } from "../state/app-context";

interface TreeNodeProps {
  folder: FolderEntry;
  depth: number;
  currentPath: string | null;
  showHidden: boolean;
  onOpen: (path: string) => void;
}

const TreeNode = memo(function TreeNode({ folder, depth, currentPath, showHidden, onOpen }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(currentPath?.startsWith(`${folder.path}/`) ?? false);
  const [children, setChildren] = useState<FolderEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

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
      <div className={`tree-row ${currentPath === folder.path ? "is-current" : ""} ${folder.hidden ? "is-hidden" : ""}`} style={{ paddingLeft: `${6 + depth * 14}px` }}>
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
          {children?.map((child) => <TreeNode key={child.path} folder={child} depth={depth + 1} currentPath={currentPath} showHidden={showHidden} onOpen={onOpen} />)}
        </div>
      ) : null}
    </div>
  );
});

export function FolderTree({ currentPath, onClose }: { currentPath: string | null; onClose?: () => void }) {
  const { bootstrap, preferences } = useApp();
  const navigate = useNavigate();
  const open = useCallback((folderPath: string) => navigate(`/browse?${query({ path: folderPath })}`), [navigate]);
  const visibleFavorites = bootstrap?.favorites.filter((favorite) => favorite.status === "ok" && (preferences.showHidden || !favorite.hidden)) ?? [];
  return (
    <aside className="side-panel left-panel" aria-label="Folders">
      <div className="panel-heading"><span>Folders</span>{onClose ? <button className="icon-button panel-close" type="button" onClick={onClose} title="Close folders" aria-label="Close folders"><PanelLeftClose size={15} /></button> : null}</div>
      {visibleFavorites.length ? (
        <section className="border-b border-default pb-2">
          <h2 className="panel-section-label"><FolderHeart size={12} /> Favorites</h2>
          {visibleFavorites.map((favorite) => (
            <button className={`favorite-row ${favorite.hidden ? "is-hidden" : ""}`} type="button" key={favorite.id} onClick={() => open(favorite.path)} title={favorite.path}>
              <span className="truncate">{favorite.alias ?? favorite.path.split("/").pop()}</span>
            </button>
          ))}
        </section>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="tree" aria-label="Media roots">
        {bootstrap?.roots.map((root) => {
          const folder: FolderEntry = { path: root.path, name: root.label, displayName: root.label, hidden: false, favorite: false };
          return root.available ? <TreeNode key={root.id} folder={folder} depth={0} currentPath={currentPath} showHidden={preferences.showHidden} onOpen={open} /> : (
            <div key={root.id} className="tree-row opacity-50" title={`${root.path} is unavailable`}><HardDrive size={14} /><span className="truncate">{root.label}</span></div>
          );
        })}
      </div>
    </aside>
  );
}
