import { ArrowRight, Check, CircleHelp, Download, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { TheseList } from "@these/shared";
import { startListDownload } from "../lib/downloads";
import { useApp } from "../state/app-context";

export function ListsPage() {
  const { bootstrap, activeList, createList, setActiveList } = useApp();
  const [name, setName] = useState("");
  return (
    <div className="page-scroll"><div className="content-page">
      <div className="page-title-row"><div><p className="eyebrow">Selections</p><h1>Lists</h1><p>Each list keeps one state per file: Selected or Maybe.</p></div></div>
      <form className="new-list-bar" onSubmit={async (event) => { event.preventDefault(); if (!name.trim()) return; await createList(name); setName(""); }}>
        <Plus size={16} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="New list name" maxLength={100} aria-label="New list name" /><button type="submit" disabled={!name.trim()}>Create list</button>
      </form>
      {bootstrap?.lists.length ? <div className="list-index">
        {bootstrap.lists.map((list) => (
          <article key={list.id} className={`list-index-row ${activeList?.id === list.id ? "is-active" : ""}`}>
            <button type="button" className="active-ring-control" onClick={() => void setActiveList(list.id)} aria-label={`Make ${list.name} active`}><span className="active-ring" /></button>
            <Link to={`/lists/${list.id}`} className="min-w-0 flex-1"><strong className="truncate">{list.name}</strong><span className="list-counts"><span><Check size={13} />{list.selectedCount} selected</span><span><CircleHelp size={13} />{list.maybeCount} maybe</span></span></Link>
            <button className="icon-button" type="button" disabled={list.selectedCount === 0} title="Download Selected" aria-label={`Download selected from ${list.name}`} onClick={() => confirmDownload(list)}><Download size={15} /></button>
            <Link className="icon-button" to={`/lists/${list.id}`} aria-label={`Open ${list.name}`}><ArrowRight size={16} /></Link>
          </article>
        ))}
      </div> : <div className="empty-state"><ListEmptyMark /><h2>No lists yet</h2><p>Create a list above, then make it active when you are ready to start selecting.</p></div>}
    </div></div>
  );
}

function ListEmptyMark() { return <div className="empty-mark"><Check size={17} /><CircleHelp size={17} /></div>; }

function confirmDownload(list: TheseList) {
  const count = list.selectedCount.toLocaleString("en-US");
  const files = list.selectedCount === 1 ? "file" : "files";
  const confirmed = window.confirm(
    `Download ${count} selected ${files} from “${list.name}”?\n\nThe server will read and compress them into a ZIP. Large lists can take a while and use significant server resources. Missing files will be skipped.`,
  );
  if (confirmed) startListDownload(list.id, "selected");
}
