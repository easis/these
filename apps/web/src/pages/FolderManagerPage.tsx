import { Check, EyeOff, FolderCog, Search, Star, Trash2, TriangleAlert, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { FolderMetadata } from "@these/shared";
import { api } from "../lib/api";
import { cx } from "../lib/cx";
import { useApp } from "../state/app-context";
import content from "../styles/content.module.css";
import ui from "../styles/ui.module.css";
import styles from "./FolderManagerPage.module.css";

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
    try {
      await api(`/api/folder-metadata/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await Promise.all([load(), refresh()]);
      setError(null);
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : "Could not update the folder.";
    }
  };
  return (
    <div className={content.pageScroll}><div className={content.widePage}>
      <div className={content.pageTitleRow}><div><p className={content.eyebrow}>Filesystem references</p><h1>Folder metadata</h1><p>Aliases, favorites, hidden subtrees and paths that need repair.</p></div></div>
      <div className={styles.managerToolbar}>
        <label className={cx(ui.searchControl, styles.managerSearch)}><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search alias or path" aria-label="Search folders" /></label>
        <div className={styles.filterTabs} role="group" aria-label="Folder filters">{(["all", "favorite", "hidden", "missing"] as const).map((value) => <button type="button" className={filter === value ? styles.active : undefined} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div>
      </div>
      {error ? <div className={ui.inlineError}>{error}</div> : null}
      <div className={styles.metadataTable} role="table" aria-label="Folder metadata">
        <div className={styles.metadataHead} role="row"><span>Folder / alias</span><span>Path</span><span>Flags</span><span>Status</span><span /></div>
        {visible.map((folder) => <FolderMetadataRow key={folder.id} folder={folder} onUpdate={(patch) => update(folder.id, patch)} onDelete={async () => { await api(`/api/folder-metadata/${folder.id}`, { method: "DELETE" }); await Promise.all([load(), refresh()]); }} />)}
      </div>
      {!visible.length ? <div className={cx(content.emptyState, content.compact)}><FolderCog size={22} /><h2>No folder metadata here</h2><p>Add an alias, favorite or hidden state while browsing. It will appear in this manager.</p></div> : null}
      <p className={styles.managerNote}><TriangleAlert size={14} />Hidden folders hide their entire subtree during normal navigation. Missing records are never deleted automatically; edit the path to a currently mounted directory to repair them.</p>
    </div></div>
  );
}

function FolderMetadataRow({ folder, onUpdate, onDelete }: { folder: FolderMetadata; onUpdate: (patch: Partial<Pick<FolderMetadata, "path" | "alias" | "favorite" | "hidden">>) => Promise<string | null>; onDelete: () => Promise<void> }) {
  const [alias, setAlias] = useState(folder.alias ?? "");
  const [folderPath, setFolderPath] = useState(folder.path);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [rowError, setRowError] = useState<string | null>(null);
  useEffect(() => {
    setAlias(folder.alias ?? "");
    setFolderPath(folder.path);
  }, [folder.alias, folder.path]);
  const changed = alias !== (folder.alias ?? "") || folderPath !== folder.path;
  const restore = () => {
    setAlias(folder.alias ?? "");
    setFolderPath(folder.path);
    setSaveState("idle");
    setRowError(null);
  };
  const commit = async (patch: Partial<Pick<FolderMetadata, "path" | "alias" | "favorite" | "hidden">> = { alias, path: folderPath }) => {
    setSaveState("saving");
    setRowError(null);
    const error = await onUpdate(patch);
    if (error) {
      setRowError(error);
      setSaveState("error");
    } else {
      setSaveState("saved");
    }
  };
  const handleFieldKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && changed && saveState !== "saving") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      restore();
    }
  };
  return (
    <div className={cx(styles.metadataRow, folder.status === "missing" && styles.missing)} role="row">
      <label className={styles.rowField}><span>Folder alias</span><input className={styles.inlineField} value={alias} placeholder="No alias" aria-label={`Alias for ${folder.path}`} onChange={(event) => { setAlias(event.target.value); setSaveState("idle"); setRowError(null); }} onKeyDown={handleFieldKey} /></label>
      <label className={styles.rowField}><span>Folder path</span><input className={cx(styles.inlineField, styles.path)} value={folderPath} aria-label={`Path for ${folder.alias || folder.path}`} aria-invalid={saveState === "error" || undefined} onChange={(event) => { setFolderPath(event.target.value); setSaveState("idle"); setRowError(null); }} onKeyDown={handleFieldKey} /></label>
      <div className={styles.metadataFlags}>
        <button type="button" className={cx(folder.favorite && styles.on, folder.favorite && styles.favorite)} aria-pressed={folder.favorite} onClick={() => void commit({ favorite: !folder.favorite })} title="Favorite" aria-label={folder.favorite ? "Remove favorite" : "Mark favorite"}><Star size={14} fill={folder.favorite ? "currentColor" : "none"} /></button>
        <button type="button" className={folder.hidden ? styles.on : undefined} aria-pressed={folder.hidden} onClick={() => void commit({ hidden: !folder.hidden })} title="Hidden" aria-label={folder.hidden ? "Unhide folder" : "Hide folder"}><EyeOff size={14} /></button>
      </div>
      <span className={cx(styles.metadataStatus, folder.status === "ok" ? styles.ok : styles.missingStatus)}>{folder.status === "ok" ? <Check size={12} /> : <X size={12} />}{folder.status}</span>
      <div className={styles.metadataActions}>{changed ? <><button className={cx(ui.compactButton, ui.primary)} type="button" disabled={saveState === "saving"} onClick={() => void commit()}>{saveState === "saving" ? "Saving…" : "Save"}</button><button className={ui.compactButton} type="button" disabled={saveState === "saving"} onClick={restore}>Cancel</button></> : null}<button className={cx(ui.iconButton, ui.dangerHover)} type="button" onClick={() => window.confirm("Remove this metadata record? The folder and files will not be changed.") && void onDelete()} title="Remove metadata" aria-label={`Remove metadata for ${folder.alias || folder.path}`}><Trash2 size={14} /></button><span className={cx(styles.saveFeedback, saveState === "error" && styles.saveError)} role={saveState === "error" ? "alert" : "status"} aria-live="polite">{saveState === "saved" ? "Saved" : rowError}</span></div>
    </div>
  );
}
