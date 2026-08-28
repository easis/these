import { Check, ChevronDown, CircleHelp, Download, Pencil, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ListItem, ListItemStatus } from "@these/shared";
import { MediaTile } from "../components/MediaTile";
import { TextInputDialog } from "../components/TextInputDialog";
import { Viewer } from "../components/Viewer";
import { api } from "../lib/api";
import { cx } from "../lib/cx";
import { startListDownload, type ListDownloadStatus } from "../lib/downloads";
import { useApp } from "../state/app-context";
import content from "../styles/content.module.css";
import ui from "../styles/ui.module.css";
import styles from "./ListPage.module.css";

export function ListPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { bootstrap, activeList, setActiveList, refresh } = useApp();
  const list = bootstrap?.lists.find((candidate) => candidate.id === id);
  const [items, setItems] = useState<ListItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const load = useCallback(async () => {
    try { setItems(await api<ListItem[]>(`/api/lists/${id}/items?limit=1000`)); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load this list."); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const setStatus = async (item: ListItem, status: ListItemStatus | null) => {
    setItems((current) => status ? current.map((entry) => entry.id === item.id ? { ...entry, status } : entry) : current.filter((entry) => entry.id !== item.id));
    if (status) await api(`/api/lists/${id}/items`, { method: "PUT", body: JSON.stringify({ path: item.path, kind: item.kind, status }) });
    else await api(`/api/lists/${id}/items?${new URLSearchParams({ path: item.path })}`, { method: "DELETE" });
    await refresh();
  };
  const selected = items.filter((item) => item.status === "selected");
  const maybe = items.filter((item) => item.status === "maybe");
  const viewerItems = items.filter((item) => !item.missing);
  if (!list && bootstrap) return <div className={content.pageScroll}><div className={content.emptyState}><h2>List not found</h2><Link to="/lists">Return to lists</Link></div></div>;
  return (
    <div className={content.pageScroll}><div className={content.widePage}>
      <div className={cx(content.pageTitleRow, styles.listDetailTitle)}>
        <div><p className={content.eyebrow}>List</p><div className={styles.listNameRow}><h1>{list?.name ?? "Loading…"}</h1>{list ? <button className={ui.iconButton} type="button" title="Edit list name" aria-label="Edit list name" onClick={() => setEditingName(true)}><Pencil size={14} /></button> : null}</div><p>{selected.length} selected · {maybe.length} maybe</p></div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {activeList?.id !== id ? <button className={ui.compactButton} type="button" onClick={() => void setActiveList(id)}>Make active</button> : <span className={styles.activeBadge}><span className={cx(ui.statusDot, ui.selected)} />Active</span>}
          <ListDownloadControl listId={id} selectedCount={list?.selectedCount ?? selected.length} maybeCount={list?.maybeCount ?? maybe.length} />
          <button className={cx(ui.iconButton, ui.bordered, ui.dangerHover)} type="button" title="Delete list" aria-label="Delete list" onClick={async () => {
            if (!window.confirm(`Delete the list “${list?.name}”? Files will not be changed.`)) return;
            await api(`/api/lists/${id}`, { method: "DELETE" }); await refresh(); navigate("/lists");
          }}><Trash2 size={14} /></button>
        </div>
      </div>
      {editingName && list ? <TextInputDialog title="Rename list" label="List name" initialValue={list.name} maxLength={100} submitLabel="Save name" onSubmit={async (name) => { await api(`/api/lists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }); await refresh(); setError(null); }} onClose={() => setEditingName(false)} /> : null}
      {error ? <div className={ui.inlineError}>{error}</div> : null}
      <ListGroup title="Selected" icon={<Check size={14} />} items={selected} empty="No selected media." onStatus={setStatus} onOpen={(item) => setViewerIndex(viewerItems.findIndex((entry) => entry.path === item.path))} />
      <ListGroup title="Maybe" icon={<CircleHelp size={14} />} items={maybe} empty="No maybe media." onStatus={setStatus} onOpen={(item) => setViewerIndex(viewerItems.findIndex((entry) => entry.path === item.path))} />
      {viewerIndex !== null && viewerIndex >= 0 ? <Viewer items={viewerItems} index={viewerIndex} classificationContext={list?.name ?? null} classificationEnabled={Boolean(list)} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} onStatus={(status) => void setStatus(viewerItems[viewerIndex]!, status)} /> : null}
    </div></div>
  );
}

function ListDownloadControl({ listId, selectedCount, maybeCount }: { listId: number; selectedCount: number; maybeCount: number }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const totalCount = selectedCount + maybeCount;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const download = (status: ListDownloadStatus) => {
    setOpen(false);
    startListDownload(listId, status);
  };

  return (
    <div className={styles.downloadControl} ref={container} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <div className={styles.downloadSplit} role="group" aria-label="List downloads">
        <button className={cx(ui.compactButton, ui.primary, styles.downloadButton, styles.downloadMain)} type="button" disabled={selectedCount === 0} onClick={() => download("selected")}><Download size={14} />Download</button>
        <button className={cx(ui.compactButton, ui.primary, styles.downloadButton, styles.downloadToggle)} type="button" disabled={totalCount === 0} aria-label="Download options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><ChevronDown size={13} /></button>
      </div>
      {open ? <div className={styles.downloadMenu} role="menu" aria-label="Download options">
        <DownloadOption label="Selected" count={selectedCount} disabled={selectedCount === 0} onClick={() => download("selected")} />
        <DownloadOption label="Maybe" count={maybeCount} disabled={maybeCount === 0} onClick={() => download("maybe")} />
        <DownloadOption label="All (Selected + Maybe)" count={totalCount} disabled={totalCount === 0} onClick={() => download("all")} />
      </div> : null}
    </div>
  );
}

function DownloadOption({ label, count, disabled, onClick }: { label: string; count: number; disabled: boolean; onClick: () => void }) {
  return <button type="button" role="menuitem" disabled={disabled} aria-label={`Download ${label} (${count})`} onClick={onClick}><span>{label}</span><span>{count.toLocaleString("en-US")}</span></button>;
}

function ListGroup({ title, icon, items, empty, onStatus, onOpen }: { title: string; icon: React.ReactNode; items: ListItem[]; empty: string; onStatus: (item: ListItem, status: ListItemStatus | null) => void; onOpen: (item: ListItem) => void }) {
  return (
    <section className={styles.listGroup}><h2>{icon}{title}<span>{items.length}</span></h2>
      {items.length ? <div className={styles.reviewGrid}>{items.map((item) => item.missing ? (
        <article className={styles.missingItem} key={item.id}><div><X size={18} /><span>Missing</span></div><p title={item.path}>{item.name}</p><button type="button" onClick={() => onStatus(item, null)}>Remove</button></article>
      ) : <MediaTile className={styles.reviewTile} key={item.id} media={item} size={180} activeList onOpen={() => onOpen(item)} onStatus={(status) => onStatus(item, status)} />)}</div> : <p className={styles.groupEmpty}>{empty}</p>}
    </section>
  );
}
