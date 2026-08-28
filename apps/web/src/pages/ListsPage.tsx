import { ArrowRight, Check, CircleHelp, CircleX, Download, Plus, Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { TheseList } from "@these/shared";
import { TextInputDialog } from "../components/TextInputDialog";
import { cx } from "../lib/cx";
import { startListDownload } from "../lib/downloads";
import { useApp } from "../state/app-context";
import content from "../styles/content.module.css";
import ui from "../styles/ui.module.css";
import styles from "./ListsPage.module.css";

export function ListsPage() {
  const { bootstrap, activeList, createList, setActiveList } = useApp();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with-media" | "empty">("all");
  const [sort, setSort] = useState<"az" | "za" | "most-media">("az");
  const deferredSearch = useDeferredValue(search);
  const lists = bootstrap?.lists ?? [];
  const visibleLists = useMemo(() => {
    const term = deferredSearch.trim().toLocaleLowerCase();
    return lists
      .filter((list) => !term || list.name.toLocaleLowerCase().includes(term))
      .filter((list) => filter === "all" || (filter === "with-media" ? listItemCount(list) > 0 : listItemCount(list) === 0))
      .sort((left, right) => sort === "most-media"
        ? listItemCount(right) - listItemCount(left) || left.name.localeCompare(right.name)
        : (sort === "az" ? 1 : -1) * left.name.localeCompare(right.name));
  }, [deferredSearch, filter, lists, sort]);
  const filtered = Boolean(search.trim()) || filter !== "all" || sort !== "az";
  return (
    <div className={content.pageScroll}><div className={content.contentPage}>
      <div className={content.pageTitleRow}><div><p className={content.eyebrow}>Selections</p><h1>Lists</h1><p>Each list keeps one state per file: Selected, Maybe, or Discarded.</p></div><button className={cx(ui.compactButton, ui.primary)} type="button" onClick={() => setCreating(true)}><Plus size={14} />New list</button></div>
      {creating ? <TextInputDialog title="Create list" label="List name" placeholder="Archive" maxLength={100} submitLabel="Create list" pendingLabel="Creating…" onSubmit={async (name) => { await createList(name); }} onClose={() => setCreating(false)} /> : null}
      {lists.length ? <div className={styles.listTools}>
        <div className={cx(ui.searchControl, styles.listSearch)} role="search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lists" aria-label="Search lists" />{search ? <button className={ui.searchClear} type="button" onClick={() => setSearch("")} aria-label="Clear list search"><X size={13} /></button> : null}</div>
        <div className={styles.listFilters} role="group" aria-label="Filter lists">{([['all', 'All'], ['with-media', 'With media'], ['empty', 'Empty']] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? styles.active : undefined} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <label className={styles.listSort}><span className="sr-only">Sort lists</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort lists"><option value="az">A–Z</option><option value="za">Z–A</option><option value="most-media">Most media</option></select></label>
      </div> : null}
      {visibleLists.length ? <div className={styles.listIndex}>
        {visibleLists.map((list) => (
          <article key={list.id} className={cx(styles.listIndexRow, activeList?.id === list.id && styles.active)}>
            <button type="button" className={ui.activeRingControl} onClick={() => void setActiveList(list.id)} aria-label={`Make ${list.name} active`}><span className={cx(ui.activeRing, activeList?.id === list.id && ui.activeRingActive)} /></button>
            <Link to={`/lists/${list.id}`} className="min-w-0 flex-1"><strong className="truncate">{list.name}</strong><span className={styles.listCounts}><span><Check size={13} />{list.selectedCount} selected</span><span><CircleHelp size={13} />{list.maybeCount} maybe</span><span><CircleX size={13} />{list.discardedCount} discarded</span></span></Link>
            <button className={ui.iconButton} type="button" disabled={list.selectedCount === 0} title="Download Selected" aria-label={`Download selected from ${list.name}`} onClick={() => confirmDownload(list)}><Download size={15} /></button>
            <Link className={ui.iconButton} to={`/lists/${list.id}`} aria-label={`Open ${list.name}`}><ArrowRight size={16} /></Link>
          </article>
        ))}
      </div> : lists.length && filtered ? <div className={content.emptyState}><Search size={24} /><h2>No matching lists</h2><p>Change the search, filter, or sort to see more lists.</p><button className={ui.compactButton} type="button" onClick={() => { setSearch(""); setFilter("all"); setSort("az"); }}>Clear results</button></div> : <div className={content.emptyState}><ListEmptyMark /><h2>No lists yet</h2><p>Create a list, then make it active when you are ready to start selecting.</p></div>}
    </div></div>
  );
}

function ListEmptyMark() { return <div className={styles.emptyMark}><Check size={17} /><CircleHelp size={17} /><CircleX size={17} /></div>; }

function listItemCount(list: TheseList) {
  return list.selectedCount + list.maybeCount + list.discardedCount;
}

function confirmDownload(list: TheseList) {
  const count = list.selectedCount.toLocaleString("en-US");
  const files = list.selectedCount === 1 ? "file" : "files";
  const confirmed = window.confirm(
    `Download ${count} selected ${files} from “${list.name}”?\n\nThe server will read and compress them into a ZIP. Large lists can take a while and use significant server resources. Missing files will be skipped.`,
  );
  if (confirmed) startListDownload(list.id, "selected");
}
