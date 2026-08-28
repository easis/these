import { Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { FolderCollection, FolderEntry } from "@these/shared";
import { api, query } from "../lib/api";
import { cx } from "../lib/cx";
import ui from "../styles/ui.module.css";
import styles from "./FolderCollectionsDialog.module.css";

export function FolderCollectionsDialog({ folder, onClose, onSaved }: { folder: FolderEntry; onClose: () => void; onSaved?: () => void }) {
  const [collections, setCollections] = useState<FolderCollection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    const controller = new AbortController();
    setLoaded(false);
    setError(null);
    void Promise.all([
      api<FolderCollection[]>("/api/collections", { signal: controller.signal }),
      api<{ collectionIds: number[] }>(`/api/folder-collections?${query({ path: folder.path })}`, { signal: controller.signal }),
    ]).then(([availableCollections, membership]) => {
      setCollections(availableCollections);
      setSelectedIds(new Set(membership.collectionIds));
      setLoaded(true);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load collections.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
      if (dialog?.open && typeof dialog.close === "function") dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [folder.path]);

  const close = () => {
    if (!saving && !creating) onClose();
  };

  const createCollection = async () => {
    if (!newName.trim() || !loaded || loading || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api<FolderCollection>("/api/collections", { method: "POST", body: JSON.stringify({ name: newName }) });
      setCollections((current) => [...current, created].sort(compareCollections));
      setSelectedIds((current) => new Set(current).add(created.id));
      setNewName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the collection.");
    } finally {
      setCreating(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!loaded || loading || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/folder-collections", {
        method: "PUT",
        body: JSON.stringify({ path: folder.path, collectionIds: [...selectedIds] }),
      });
      onSaved?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update collection membership.");
      setSaving(false);
    }
  };

  return createPortal(
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={loading || saving || creating} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event: MouseEvent<HTMLDialogElement>) => { if (event.target === event.currentTarget) close(); }}>
      <form className={styles.form} onSubmit={(event) => void save(event)}>
        <div className={styles.heading}>
          <h2 id={titleId}>Add to collections</h2>
          <p id={descriptionId}>Choose every collection that should contain <strong>{folder.displayName}</strong>.</p>
          <code className={styles.path} title={folder.path}>{folder.path}</code>
        </div>
        <div className={styles.collectionList} aria-label="Collections">
          {loading ? <p className={styles.empty}>Loading collections…</p> : collections.length ? collections.map((collection) => (
            <label className={styles.collectionOption} key={collection.id}>
              <input type="checkbox" checked={selectedIds.has(collection.id)} disabled={!loaded || saving} onChange={(event) => setSelectedIds((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(collection.id); else next.delete(collection.id);
                return next;
              })} />
              <strong>{collection.name}</strong>
              <small>{collection.folderCount}</small>
            </label>
          )) : <p className={styles.empty}>No collections yet. Create the first one below.</p>}
        </div>
        <div className={styles.createRow}>
          <input value={newName} maxLength={100} disabled={!loaded || loading || saving || creating} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createCollection(); } }} placeholder="New collection name" aria-label="New collection name" />
          <button className={ui.compactButton} type="button" disabled={!newName.trim() || !loaded || loading || saving || creating} onClick={() => void createCollection()}><Plus size={13} />{creating ? "Creating…" : "Create"}</button>
        </div>
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
        <div className={styles.actions}>
          <button className={ui.compactButton} type="button" disabled={saving || creating} onClick={close}>Cancel</button>
          <button className={cx(ui.compactButton, ui.primary)} type="submit" disabled={!loaded || loading || saving || creating}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}

function compareCollections(left: FolderCollection, right: FolderCollection) {
  return left.name.localeCompare(right.name, undefined, { numeric: false }) || left.id - right.id;
}
