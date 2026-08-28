import { ArrowRight, FolderHeart, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { FolderCollection } from "@these/shared";
import { CollectionMark } from "../components/CollectionMark";
import { TextInputDialog } from "../components/TextInputDialog";
import { api } from "../lib/api";
import { cx } from "../lib/cx";
import content from "../styles/content.module.css";
import ui from "../styles/ui.module.css";
import styles from "./CollectionsPage.module.css";

export function CollectionsPage() {
  const [collections, setCollections] = useState<FolderCollection[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setCollections(await api<FolderCollection[]>("/api/collections"));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load collections.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className={content.pageScroll}><div className={content.contentPage}>
      <div className={content.pageTitleRow}><div><p className={content.eyebrow}>Folder groups</p><h1>Collections</h1><p>Keep related datasets together while every folder stays in its original location.</p></div><button className={cx(ui.compactButton, ui.primary)} type="button" onClick={() => setCreating(true)}><Plus size={14} />New collection</button></div>
      {error ? <div className={ui.inlineError} role="alert">{error}</div> : null}
      {loading ? <div className={cx(content.emptyState, content.compact)}><p>Loading collections…</p></div> : collections.length ? <div className={styles.collectionIndex}>
        {collections.map((collection) => <article className={styles.collectionRow} key={collection.id}>
          <CollectionMark className={styles.collectionMark} />
          <Link to={`/collections/${collection.id}`}><strong>{collection.name}</strong><small>{formatFolderCount(collection.folderCount)}</small></Link>
          <Link className={ui.iconButton} to={`/collections/${collection.id}`} aria-label={`Open ${collection.name}`}><ArrowRight size={16} /></Link>
        </article>)}
      </div> : <div className={content.emptyState}><FolderHeart size={24} /><h2>No collections yet</h2><p>Create a collection here or use “Add to collections” while browsing a folder.</p></div>}
      {creating ? <TextInputDialog title="Create collection" label="Collection name" placeholder="Dogs" maxLength={100} submitLabel="Create collection" pendingLabel="Creating…" onSubmit={async (name) => { await api("/api/collections", { method: "POST", body: JSON.stringify({ name }) }); await load(); }} onClose={() => setCreating(false)} /> : null}
    </div></div>
  );
}

function formatFolderCount(count: number) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "folder" : "folders"}`;
}
