import { Check, EyeOff, FolderCog, Search, Star, Trash2, TriangleAlert, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { FolderMetadata } from "@these/shared";
import { api } from "../lib/api";
import { useApp } from "../state/app-context";

type FolderFilter = "all" | "favorite" | "hidden" | "missing";

export function FolderManagerPage() {
  const { refresh } = useApp();
  const [folders, setFolders] = useState<FolderMetadata[]>([]);
  const [filter, setFilter] = useState<FolderFilter>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.toLocaleLowerCase());
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try { setFolders(await api<FolderMetadata[]>("/api/folder-metadata")); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load folder metadata."); }
  };
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => folders.filter((folder) => {
    if (filter === "favorite" && !folder.favorite) return false;
    if (filter === "hidden" && !folder.hidden) return false;
    if (filter === "missing" && folder.status !== "missing") return false;
    return !deferredSearch || folder.path.toLocaleLowerCase().includes(deferredSearch) || folder.alias?.toLocaleLowerCase().includes(deferredSearch);
  }), [folders, filter, deferredSearch]);
  const update = async (id: number, patch: Partial<Pick<FolderMetadata, "path" | "alias" | "favorite" | "hidden">>) => {
    try { await api(`/api/folder-metadata/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); await Promise.all([load(), refresh()]); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update the folder."); }
  };
  return (
    <div className="page-scroll"><div className="wide-page">
      <div className="page-title-row"><div><p className="eyebrow">Filesystem references</p><h1>Folder metadata</h1><p>Aliases, favorites, hidden subtrees and paths that need repair.</p></div></div>
      <div className="manager-toolbar">
        <label className="search-control"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search alias or path" aria-label="Search folders" /></label>
        <div className="filter-tabs" role="group" aria-label="Folder filters">{(["all", "favorite", "hidden", "missing"] as const).map((value) => <button type="button" className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div>
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="metadata-table" role="table" aria-label="Folder metadata">
        <div className="metadata-head" role="row"><span>Folder / alias</span><span>Path</span><span>Flags</span><span>Status</span><span /></div>
        {visible.map((folder) => <FolderMetadataRow key={folder.id} folder={folder} onUpdate={(patch) => update(folder.id, patch)} onDelete={async () => { await api(`/api/folder-metadata/${folder.id}`, { method: "DELETE" }); await Promise.all([load(), refresh()]); }} />)}
      </div>
      {!visible.length ? <div className="empty-state compact"><FolderCog size={22} /><h2>No folder metadata here</h2><p>Add an alias, favorite or hidden state while browsing. It will appear in this manager.</p></div> : null}
      <p className="manager-note"><TriangleAlert size={14} />Hidden folders hide their entire subtree during normal navigation. Missing records are never deleted automatically; edit the path to a currently mounted directory to repair them.</p>
    </div></div>
  );
}

function FolderMetadataRow({ folder, onUpdate, onDelete }: { folder: FolderMetadata; onUpdate: (patch: Partial<Pick<FolderMetadata, "path" | "alias" | "favorite" | "hidden">>) => Promise<void>; onDelete: () => Promise<void> }) {
  const [alias, setAlias] = useState(folder.alias ?? "");
  const [folderPath, setFolderPath] = useState(folder.path);
  const changed = alias !== (folder.alias ?? "") || folderPath !== folder.path;
  return (
    <div className={`metadata-row ${folder.status === "missing" ? "is-missing" : ""}`} role="row">
      <div><input className="inline-field alias" value={alias} placeholder="No alias" onChange={(event) => setAlias(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && changed) void onUpdate({ alias, path: folderPath }); if (event.key === "Escape") { setAlias(folder.alias ?? ""); setFolderPath(folder.path); } }} /></div>
      <div><input className="inline-field path" value={folderPath} onChange={(event) => setFolderPath(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && changed) void onUpdate({ alias, path: folderPath }); if (event.key === "Escape") setFolderPath(folder.path); }} /></div>
      <div className="metadata-flags">
        <button type="button" className={folder.favorite ? "is-on favorite" : ""} onClick={() => void onUpdate({ favorite: !folder.favorite })} title="Favorite"><Star size={14} fill={folder.favorite ? "currentColor" : "none"} /></button>
        <button type="button" className={folder.hidden ? "is-on" : ""} onClick={() => void onUpdate({ hidden: !folder.hidden })} title="Hidden"><EyeOff size={14} /></button>
      </div>
      <span className={`metadata-status ${folder.status}`} >{folder.status === "ok" ? <Check size={12} /> : <X size={12} />}{folder.status}</span>
      <div className="metadata-actions">{changed ? <button className="compact-button primary" type="button" onClick={() => void onUpdate({ alias, path: folderPath })}>Save</button> : null}<button className="icon-button danger-hover" type="button" onClick={() => window.confirm("Remove this metadata record? The folder and files will not be changed.") && void onDelete()} aria-label="Remove metadata"><Trash2 size={14} /></button></div>
    </div>
  );
}
