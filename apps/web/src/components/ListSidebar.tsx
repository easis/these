import { Check, CircleHelp, PanelRightClose, Plus, Settings2 } from "lucide-react";
import { useCallback, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { cx } from "../lib/cx";
import { listSidebarWidth } from "../lib/preferences";
import { useApp } from "../state/app-context";
import ui from "../styles/ui.module.css";
import styles from "./ListSidebar.module.css";
import sidebar from "./Sidebar.module.css";
import { TextInputDialog } from "./TextInputDialog";
import { useSidebarResize } from "./useSidebarResize";

export function ListSidebar({ onClose, onSelection, modal = false }: { onClose?: () => void; onSelection?: () => void; modal?: boolean }) {
  const { bootstrap, activeList, preferences, setActiveList, createList, setPreferences } = useApp();
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState(false);
  const activatingRef = useRef(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const commitWidth = useCallback((rightSidebarWidth: number) => setPreferences({ rightSidebarWidth }), [setPreferences]);
  const resize = useSidebarResize({ storedWidth: preferences.rightSidebarWidth, config: listSidebarWidth, edge: "left", reserveForOppositeSidebar: preferences.leftSidebarOpen, onCommit: commitWidth });
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
    <aside ref={resize.sidebarRef} id="list-sidebar" className={cx(sidebar.sidePanel, styles.rightPanel)} role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label="Lists" aria-busy={activating} tabIndex={modal ? -1 : undefined} style={{ "--sidebar-width": `${resize.renderedWidth}px` } as CSSProperties}>
      <div className={sidebar.panelHeading}>
        <span>Lists</span>
        <span className={sidebar.panelHeadingActions}>
          {onClose ? <button className={cx(ui.iconButton, sidebar.panelClose, sidebar.tabletClose)} type="button" onClick={onClose} title="Close lists" aria-label="Close lists"><PanelRightClose size={15} /></button> : null}
        </span>
      </div>
      <button className={styles.listCreateTrigger} type="button" onClick={() => setCreating(true)}><Plus size={14} />New list</button>
      {creating ? <TextInputDialog title="Create list" label="List name" placeholder="Archive" maxLength={100} submitLabel="Create list" pendingLabel="Creating…" onSubmit={async (name) => { await createList(name); }} onClose={() => setCreating(false)} /> : null}
      {activationError ? <div className={cx(ui.inlineError, "mx-1.5 mb-2")} role="alert">{activationError}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {bootstrap?.lists.length ? bootstrap.lists.map((list) => {
          const isActive = activeList?.id === list.id;
          return (
            <div className={cx(styles.listRow, isActive && styles.active)} key={list.id}>
              <button className={styles.listSelect} type="button" disabled={activating} onClick={() => void activate(isActive ? null : list.id)} aria-label={isActive ? `Deactivate ${list.name}` : `Make ${list.name} active`} aria-pressed={isActive}>
                <span className={cx(ui.activeRing, isActive && ui.activeRingActive)} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{list.name}</span>
                  <span className={cx(styles.listSelectCounts, "mt-0.5 flex items-center gap-2 text-muted")}>
                    <span className="inline-flex items-center gap-1"><Check size={11} />{list.selectedCount}</span>
                    <span className="inline-flex items-center gap-1"><CircleHelp size={11} />{list.maybeCount}</span>
                  </span>
                </span>
              </button>
              <Link className={cx(styles.listManage, ui.iconButton)} to={`/lists/${list.id}`} onClick={onSelection} title={`Manage ${list.name}`} aria-label={`Manage ${list.name}`}><Settings2 size={14} /></Link>
            </div>
          );
        }) : <p className={styles.emptyCompact}>No lists yet.<br />Create one to start selecting.</p>}
      </div>
      {!modal ? <div ref={resize.separatorRef} className={cx(sidebar.sidebarResizer, styles.listSidebarResizer)} role="separator" aria-label="Resize list sidebar" aria-orientation="vertical" aria-valuemin={listSidebarWidth.min} aria-valuemax={resize.maximumWidth} aria-valuenow={resize.renderedWidth} aria-valuetext={`${resize.renderedWidth} pixels`} tabIndex={0} title="Resize lists" onPointerDown={resize.startResize} onPointerMove={resize.continueResize} onPointerUp={resize.endResize} onPointerCancel={resize.cancelResize} onKeyDown={resize.resizeWithKeyboard} /> : null}
    </aside>
  );
}
