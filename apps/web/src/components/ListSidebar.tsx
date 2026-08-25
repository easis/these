import { Check, CircleHelp, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../state/app-context";

export function ListSidebar() {
  const { bootstrap, activeList, setActiveList, createList } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  return (
    <aside className="side-panel right-panel" aria-label="Lists">
      <div className="panel-heading">
        <span>Lists</span>
        <button className="icon-button" type="button" title="New list" aria-label="New list" onClick={() => setCreating(true)}><Plus size={15} /></button>
      </div>
      {creating ? (
        <form className="px-2 pb-2" onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim()) return;
          await createList(name);
          setName("");
          setCreating(false);
        }}>
          <input autoFocus className="compact-input w-full" placeholder="New list" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setCreating(false)} />
        </form>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {bootstrap?.lists.length ? bootstrap.lists.map((list) => (
          <div className={`list-row ${activeList?.id === list.id ? "is-active" : ""}`} key={list.id}>
            <button className="list-activate" type="button" onClick={() => void setActiveList(list.id)} aria-label={`Make ${list.name} active`}>
              <span className="active-ring" aria-hidden="true" />
            </button>
            <Link className="min-w-0 flex-1" to={`/lists/${list.id}`}>
              <span className="block truncate text-sm font-medium">{list.name}</span>
              <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1"><Check size={11} />{list.selectedCount}</span>
                <span className="inline-flex items-center gap-1"><CircleHelp size={11} />{list.maybeCount}</span>
              </span>
            </Link>
          </div>
        )) : <p className="empty-compact">No lists yet.<br />Create one to start selecting.</p>}
      </div>
    </aside>
  );
}
