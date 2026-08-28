import { ArrowRight, FolderHeart, Plus, Search, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with-folders" | "empty">("all");
  const [sort, setSort] = useState<"az" | "za" | "most-folders">("az");
  const deferredSearch = useDeferredValue(search);
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
  const visibleCollections = useMemo(() => {
    const term = deferredSearch.trim().toLocaleLowerCase();
    return collections
      .filter((collection) => !term || collection.name.toLocaleLowerCase().includes(term))
      .filter((collection) => filter === "all" || (filter === "with-folders" ? collection.folderCount > 0 : collection.folderCount === 0))
      .sort((left, right) => sort === "most-folders"
        ? right.folderCount - left.folderCount || left.name.localeCompare(right.name)
        : (sort === "az" ? 1 : -1) * left.name.localeCompare(right.name));
  }, [collections, deferredSearch, filter, sort]);
  const filtered = Boolean(search) || filter !== "all" || sort !== "az";
  return (
    <div className={content.pageScroll}><div className={content.contentPage}>
      <div className={content.pageTitleRow}><div><p className={content.eyebrow}>Folder groups</p><h1>Collections</h1><p>Keep related datasets together while every folder stays in its original location.</p></div><button className={cx(ui.compactButton, ui.primary)} type="button" onClick={() => setCreating(true)}><Plus size={14} />New collection</button></div>
      {error ? <div className={ui.inlineError} role="alert">{error}</div> : null}
      {collections.length ? <div className={styles.collectionTools}>
        <div className={cx(ui.searchControl, styles.collectionSearch)} role="search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search collections" aria-label="Search collections" />{search ? <button className={ui.searchClear} type="button" onClick={() => setSearch("")} aria-label="Clear collection search"><X size={13} /></button> : null}</div>
        <div className={styles.collectionFilters} role="group" aria-label="Filter collections">{([['all', 'All'], ['with-folders', 'With folders'], ['empty', 'Empty']] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? styles.active : undefined} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <label className={styles.collectionSort}><span className="sr-only">Sort collections</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort collections"><option value="az">A–Z</option><option value="za">Z–A</option><option value="most-folders">Most folders</option></select></label>
      </div> : null}
      {loading ? <div className={cx(content.emptyState, content.compact)}><p>Loading collections…</p></div> : visibleCollections.length ? <div className={styles.collectionIndex}>
        {visibleCollections.map((collection) => <article className={styles.collectionRow} key={collection.id}>
          <CollectionMark className={styles.collectionMark} />
          <Link to={`/collections/${collection.id}`}><strong>{collection.name}</strong><small>{formatFolderCount(collection.folderCount)}</small></Link>
          <Link className={ui.iconButton} to={`/collections/${collection.id}`} aria-label={`Open ${collection.name}`}><ArrowRight size={16} /></Link>
        </article>)}
      </div> : collections.length && filtered ? <div className={content.emptyState}><Search size={24} /><h2>No matching collections</h2><p>Change the search, filter, or sort to see more collections.</p><button className={ui.compactButton} type="button" onClick={() => { setSearch(""); setFilter("all"); setSort("az"); }}>Clear results</button></div> : <div className={content.emptyState}><FolderHeart size={24} /><h2>No collections yet</h2><p>Create a collection here or use “Add to collections” while browsing a folder.</p></div>}
      {creating ? <TextInputDialog title="Create collection" label="Collection name" placeholder="Dogs" maxLength={100} submitLabel="Create collection" pendingLabel="Creating…" onSubmit={async (name) => { await api("/api/collections", { method: "POST", body: JSON.stringify({ name }) }); await load(); }} onClose={() => setCreating(false)} /> : null}
    </div></div>
  );
}

function formatFolderCount(count: number) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "folder" : "folders"}`;
}
