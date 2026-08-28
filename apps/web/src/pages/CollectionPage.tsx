import { EyeOff, Folder, FolderHeart, Images, Pencil, Star, Trash2, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FolderCollectionDetail } from "@these/shared";
import { CollectionMark } from "../components/CollectionMark";
import { TextInputDialog } from "../components/TextInputDialog";
import { api, isAbortError, query } from "../lib/api";
import { cx } from "../lib/cx";
import { useApp } from "../state/app-context";
import content from "../styles/content.module.css";
import ui from "../styles/ui.module.css";
import styles from "./CollectionsPage.module.css";

export function CollectionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { preferences } = useApp();
  const collectionId = Number(id);
  const [collection, setCollection] = useState<FolderCollectionDetail | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!Number.isInteger(collectionId) || collectionId <= 0) {
      setError("Collection not found.");
      setLoading(false);
      return;
    }
    try {
      setCollection(await api<FolderCollectionDetail>(`/api/collections/${collectionId}`, signal ? { signal } : undefined));
      setError(null);
    } catch (caught) {
      if (isAbortError(caught)) return;
      setError(caught instanceof Error ? caught.message : "Could not load the collection.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [collectionId]);
  useEffect(() => {
    const controller = new AbortController();
    setCollection(null);
    setError(null);
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const removeFolder = async (folderPath: string) => {
    try {
      await api(`/api/collections/${collectionId}/folders?${query({ path: folderPath })}`, { method: "DELETE" });
      setCollection((current) => current ? { ...current, folderCount: Math.max(0, current.folderCount - 1), folders: current.folders.filter((folder) => folder.path !== folderPath) } : current);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the folder.");
    }
  };

  const deleteCollection = async () => {
    if (!collection || !window.confirm(`Delete “${collection.name}”? Its folders and files will not be changed.`)) return;
    try {
      await api(`/api/collections/${collection.id}`, { method: "DELETE" });
      navigate("/collections", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the collection.");
    }
  };

  return (
    <div className={content.pageScroll}><div className={content.contentPage}>
      {collection ? <div className={cx(content.pageTitleRow, styles.detailTitle)}><div><p className={content.eyebrow}>Collection</p><div className={styles.titleLine}><CollectionMark className={styles.collectionMark} /><h1>{collection.name}</h1></div><p>{collection.folderCount} {collection.folderCount === 1 ? "folder" : "folders"} available as a focused Browse workspace.</p></div><div className={styles.titleActions}><Link className={cx(ui.compactButton, ui.primary)} to={`/browse?${query({ collection: collection.id })}`}><Images size={13} />Browse collection</Link><button className={ui.compactButton} type="button" onClick={() => setRenaming(true)}><Pencil size={13} />Rename</button><button className={cx(ui.compactButton, styles.dangerButton)} type="button" onClick={() => void deleteCollection()}><Trash2 size={13} />Delete</button></div></div> : null}
      {error ? <div className={cx(ui.inlineError, styles.detailError)} role="alert">{error}</div> : null}
      {loading ? <div className={cx(content.emptyState, content.compact)}><p>Loading collection…</p></div> : collection?.folders.length ? <div className={styles.folderShelf}>
        {collection.folders.map((folder) => <article className={styles.folderRow} key={folder.path}>
          {folder.status === "ready" && (!folder.hidden || preferences.showHidden) ? <Link className={styles.folderLink} to={`/browse?${query({ collection: collection.id, path: folder.path })}`} title={folder.path}><Folder size={18} fill="currentColor" fillOpacity={0.1} /><span><strong>{folder.displayName}</strong><code>{folder.path}</code></span></Link> : <div className={styles.unavailableFolder} title={folder.path}>{folder.hidden && !preferences.showHidden ? <EyeOff size={18} /> : <WifiOff size={18} />}<span><strong>{folder.displayName}</strong><code>{folder.path}</code></span></div>}
          <div className={styles.folderMeta}>
            {folder.favorite ? <span className={styles.badge} title="Favorite"><Star size={12} fill="currentColor" />Favorite</span> : null}
            {folder.hidden ? <span className={styles.badge} title="Hidden"><EyeOff size={12} />Hidden</span> : null}
            {folder.status === "root-unavailable" ? <span className={cx(styles.badge, styles.unavailable)}>Root unavailable</span> : null}
            {folder.status === "unavailable" ? <span className={cx(styles.badge, styles.unavailable)}>Folder unavailable</span> : null}
            <button className={cx(ui.iconButton, ui.dangerHover)} type="button" onClick={() => void removeFolder(folder.path)} aria-label={`Remove ${folder.displayName} from ${collection.name}`}><Trash2 size={14} /></button>
          </div>
        </article>)}
      </div> : !loading && collection ? <div className={content.emptyState}><FolderHeart size={24} /><h2>This collection is empty</h2><p>Browse your folders and add any of them to this collection.</p><Link className={cx(ui.compactButton, ui.primary)} to="/browse"><Images size={13} />Browse folders</Link></div> : null}
      {renaming && collection ? <TextInputDialog title="Rename collection" label="Collection name" initialValue={collection.name} maxLength={100} submitLabel="Save name" onSubmit={async (name) => { await api(`/api/collections/${collection.id}`, { method: "PATCH", body: JSON.stringify({ name }) }); await load(); }} onClose={() => setRenaming(false)} /> : null}
    </div></div>
  );
}
