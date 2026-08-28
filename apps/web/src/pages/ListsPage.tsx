import { ArrowRight, Check, CircleHelp, CircleX, Download, Plus } from "lucide-react";
import { useState } from "react";
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
  return (
    <div className={content.pageScroll}><div className={content.contentPage}>
      <div className={content.pageTitleRow}><div><p className={content.eyebrow}>Selections</p><h1>Lists</h1><p>Each list keeps one state per file: Selected, Maybe, or Discarded.</p></div><button className={cx(ui.compactButton, ui.primary)} type="button" onClick={() => setCreating(true)}><Plus size={14} />New list</button></div>
      {creating ? <TextInputDialog title="Create list" label="List name" placeholder="Archive" maxLength={100} submitLabel="Create list" pendingLabel="Creating…" onSubmit={async (name) => { await createList(name); }} onClose={() => setCreating(false)} /> : null}
      {bootstrap?.lists.length ? <div className={styles.listIndex}>
        {bootstrap.lists.map((list) => (
          <article key={list.id} className={cx(styles.listIndexRow, activeList?.id === list.id && styles.active)}>
            <button type="button" className={ui.activeRingControl} onClick={() => void setActiveList(list.id)} aria-label={`Make ${list.name} active`}><span className={cx(ui.activeRing, activeList?.id === list.id && ui.activeRingActive)} /></button>
            <Link to={`/lists/${list.id}`} className="min-w-0 flex-1"><strong className="truncate">{list.name}</strong><span className={styles.listCounts}><span><Check size={13} />{list.selectedCount} selected</span><span><CircleHelp size={13} />{list.maybeCount} maybe</span><span><CircleX size={13} />{list.discardedCount} discarded</span></span></Link>
            <button className={ui.iconButton} type="button" disabled={list.selectedCount === 0} title="Download Selected" aria-label={`Download selected from ${list.name}`} onClick={() => confirmDownload(list)}><Download size={15} /></button>
            <Link className={ui.iconButton} to={`/lists/${list.id}`} aria-label={`Open ${list.name}`}><ArrowRight size={16} /></Link>
          </article>
        ))}
      </div> : <div className={content.emptyState}><ListEmptyMark /><h2>No lists yet</h2><p>Create a list, then make it active when you are ready to start selecting.</p></div>}
    </div></div>
  );
}

function ListEmptyMark() { return <div className={styles.emptyMark}><Check size={17} /><CircleHelp size={17} /><CircleX size={17} /></div>; }

function confirmDownload(list: TheseList) {
  const count = list.selectedCount.toLocaleString("en-US");
  const files = list.selectedCount === 1 ? "file" : "files";
  const confirmed = window.confirm(
    `Download ${count} selected ${files} from “${list.name}”?\n\nThe server will read and compress them into a ZIP. Large lists can take a while and use significant server resources. Missing files will be skipped.`,
  );
  if (confirmed) startListDownload(list.id, "selected");
}
