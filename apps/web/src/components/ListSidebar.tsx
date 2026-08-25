import { Check, CircleHelp, PanelRightClose, Plus, Settings2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../state/app-context";
import { TextInputDialog } from "./TextInputDialog";

export function ListSidebar({ onClose, onSelection, modal = false }: { onClose?: () => void; onSelection?: () => void; modal?: boolean }) {
  const { bootstrap, activeList, setActiveList, createList } = useApp();
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState(false);
  const activatingRef = useRef(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const activate = async (id: number | null) => {
    if (activatingRef.current) return;
    activatingRef.current = true;
    setActivating(true);
    setActivationError(null);
    try {
      await setActiveList(id);
      onSelection?.();
    } catch (caught) {
      setActivationError(caught instanceof Error ? caught.message : "Could not change the active list.");
    } finally {
      activatingRef.current = false;
      setActivating(false);
    }
  };
  return (
    <aside id="list-sidebar" className="side-panel right-panel" role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label="Lists" aria-busy={activating} tabIndex={modal ? -1 : undefined}>
      <div className="panel-heading">
        <span>Lists</span>
        <span className="panel-heading-actions">
          {onClose ? <button className="icon-button panel-close" type="button" onClick={onClose} title="Close lists" aria-label="Close lists"><PanelRightClose size={15} /></button> : null}
        </span>
      </div>
      <button className="list-create-trigger" type="button" onClick={() => setCreating(true)}><Plus size={14} />New list</button>
      {creating ? <TextInputDialog title="Create list" label="List name" placeholder="Archive" maxLength={100} submitLabel="Create list" pendingLabel="Creating…" onSubmit={async (name) => { await createList(name); }} onClose={() => setCreating(false)} /> : null}
      {activationError ? <div className="inline-error mx-1.5 mb-2" role="alert">{activationError}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {bootstrap?.lists.length ? bootstrap.lists.map((list) => {
          const isActive = activeList?.id === list.id;
          return (
            <div className={`list-row ${isActive ? "is-active" : ""}`} key={list.id}>
              <button className="list-select" type="button" disabled={activating} onClick={() => void activate(isActive ? null : list.id)} aria-label={isActive ? `Deactivate ${list.name}` : `Make ${list.name} active`} aria-pressed={isActive}>
                <span className="active-ring" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{list.name}</span>
                  <span className="list-select-counts mt-0.5 flex items-center gap-2 text-muted">
                    <span className="inline-flex items-center gap-1"><Check size={11} />{list.selectedCount}</span>
                    <span className="inline-flex items-center gap-1"><CircleHelp size={11} />{list.maybeCount}</span>
                  </span>
                </span>
              </button>
              <Link className="list-manage icon-button" to={`/lists/${list.id}`} onClick={onSelection} title={`Manage ${list.name}`} aria-label={`Manage ${list.name}`}><Settings2 size={14} /></Link>
            </div>
          );
        }) : <p className="empty-compact">No lists yet.<br />Create one to start selecting.</p>}
      </div>
    </aside>
  );
}
