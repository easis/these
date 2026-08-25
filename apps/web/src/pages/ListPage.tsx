import { Check, CircleHelp, Download, MoreHorizontal, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ListItem, ListItemStatus } from "@these/shared";
import { MediaTile } from "../components/MediaTile";
import { Viewer } from "../components/Viewer";
import { api } from "../lib/api";
import { useApp } from "../state/app-context";

export function ListPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { bootstrap, activeList, setActiveList, refresh } = useApp();
  const list = bootstrap?.lists.find((candidate) => candidate.id === id);
  const [items, setItems] = useState<ListItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  if (!list && bootstrap) return <div className="page-scroll"><div className="empty-state"><h2>List not found</h2><Link to="/lists">Return to lists</Link></div></div>;
  return (
    <div className="page-scroll"><div className="wide-page">
      <div className="page-title-row list-detail-title">
        <div><p className="eyebrow">List</p><h1>{list?.name ?? "Loading…"}</h1><p>{selected.length} selected · {maybe.length} maybe</p></div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {activeList?.id !== id ? <button className="compact-button" type="button" onClick={() => void setActiveList(id)}>Make active</button> : <span className="active-badge"><span className="status-dot is-selected" />Active list</span>}
          <a className="compact-button primary" href={`/api/lists/${id}/download?status=selected`}><Download size={14} />Download Selected</a>
          <a className="icon-button bordered" href={`/api/lists/${id}/download?status=maybe`} title="Download Maybe" aria-label="Download Maybe"><MoreHorizontal size={15} /></a>
          <button className="icon-button bordered danger-hover" type="button" title="Delete list" aria-label="Delete list" onClick={async () => {
            if (!window.confirm(`Delete the list “${list?.name}”? Files will not be changed.`)) return;
            await api(`/api/lists/${id}`, { method: "DELETE" }); await refresh(); navigate("/lists");
          }}><Trash2 size={14} /></button>
        </div>
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      <ListGroup title="Selected" icon={<Check size={14} />} items={selected} empty="No selected media." onStatus={setStatus} onOpen={(item) => setViewerIndex(viewerItems.findIndex((entry) => entry.path === item.path))} />
      <ListGroup title="Maybe" icon={<CircleHelp size={14} />} items={maybe} empty="No maybe media." onStatus={setStatus} onOpen={(item) => setViewerIndex(viewerItems.findIndex((entry) => entry.path === item.path))} />
      {viewerIndex !== null && viewerIndex >= 0 ? <Viewer items={viewerItems} index={viewerIndex} classificationContext={list ? `List: ${list.name}` : null} classificationEnabled={Boolean(list)} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} onStatus={(status) => void setStatus(viewerItems[viewerIndex]!, status)} /> : null}
    </div></div>
  );
}

function ListGroup({ title, icon, items, empty, onStatus, onOpen }: { title: string; icon: React.ReactNode; items: ListItem[]; empty: string; onStatus: (item: ListItem, status: ListItemStatus | null) => void; onOpen: (item: ListItem) => void }) {
  return (
    <section className="list-group"><h2>{icon}{title}<span>{items.length}</span></h2>
      {items.length ? <div className="review-grid">{items.map((item) => item.missing ? (
        <article className="missing-item" key={item.id}><div><X size={18} /><span>Missing</span></div><p title={item.path}>{item.name}</p><button type="button" onClick={() => onStatus(item, null)}>Remove</button></article>
      ) : <MediaTile key={item.id} media={item} size={180} activeList onOpen={() => onOpen(item)} onStatus={(status) => onStatus(item, status)} />)}</div> : <p className="group-empty">{empty}</p>}
    </section>
  );
}
