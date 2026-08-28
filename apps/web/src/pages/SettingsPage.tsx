import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { MediaRoot } from "@these/shared";
import { AppName } from "../components/AppName";
import { api } from "../lib/api";
import { cx } from "../lib/cx";
import { useApp } from "../state/app-context";
import content from "../styles/content.module.css";
import ui from "../styles/ui.module.css";
import styles from "./SettingsPage.module.css";

interface RootDraft {
  label: string;
  path: string;
}

const emptyDraft: RootDraft = { label: "", path: "" };

export function SettingsPage() {
  const { preferences, setPreferences, bootstrap, refresh } = useApp();
  const [draft, setDraft] = useState<RootDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathTouched, setPathTouched] = useState(false);
  const pathError = validateThesePath(draft.path);

  const saveRoot = async (event: FormEvent) => {
    event.preventDefault();
    setPathTouched(true);
    if (pathError) return;
    setSaving(true);
    try {
      await api(editingId ? `/api/settings/media-roots/${editingId}` : "/api/settings/media-roots", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(draft),
      });
      setDraft(emptyDraft);
      setEditingId(null);
      setPathTouched(false);
      setPreferences({ lastFolder: null });
      await refresh();
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the media root.");
    } finally {
      setSaving(false);
    }
  };

  const editRoot = (root: MediaRoot) => {
    setEditingId(root.id);
    setDraft({ label: root.label, path: root.path });
    setPathTouched(false);
    setError(null);
  };

  const deleteRoot = async (root: MediaRoot) => {
    if (!window.confirm(`Remove “${root.label}” from the application? Files and saved list references will not be changed.`)) return;
    try {
      await api(`/api/settings/media-roots/${root.id}`, { method: "DELETE" });
      if (editingId === root.id) {
        setEditingId(null);
        setDraft(emptyDraft);
      }
      setPreferences({ lastFolder: null });
      await refresh();
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the media root.");
    }
  };

  return (
    <div className={content.pageScroll}><div className={cx(content.contentPage, content.narrow)}>
      <div className={content.pageTitleRow}><div><p className={content.eyebrow}>This browser</p><h1>Settings</h1><p>Gallery preferences stay in this browser. Lists and media roots are stored in <AppName />.</p></div></div>
      <section className={styles.settingsSection}><h2>Gallery</h2><p>Desktop size and mobile density are saved independently in this browser.</p><label className={styles.settingRange}><span>Desktop size</span><input type="range" min="120" max="280" step="20" value={preferences.thumbnailSize} onChange={(event) => setPreferences({ thumbnailSize: Number(event.target.value) })} /><output>{preferences.thumbnailSize}px</output></label><div className={styles.densitySetting}><span>Mobile density</span><div role="group" aria-label="Mobile gallery density"><button type="button" className={preferences.mobileGalleryDensity === "compact" ? styles.active : undefined} aria-pressed={preferences.mobileGalleryDensity === "compact"} onClick={() => setPreferences({ mobileGalleryDensity: "compact" })}>Compact</button><button type="button" className={preferences.mobileGalleryDensity === "comfortable" ? styles.active : undefined} aria-pressed={preferences.mobileGalleryDensity === "comfortable"} onClick={() => setPreferences({ mobileGalleryDensity: "comfortable" })}>Comfortable</button></div></div><label className={styles.settingCheck}><input type="checkbox" checked={preferences.showHidden} onChange={(event) => setPreferences({ showHidden: event.target.checked })} /><span>Show hidden folders</span></label></section>
      <section className={styles.settingsSection}>
        <h2>Media roots</h2>
        <p>Add the paths as they are visible inside <AppName />. Missing mounts remain configured and are marked unavailable.</p>
        {error ? <div className={cx(ui.inlineError, styles.rootError)}>{error}</div> : null}
        <form className={styles.rootForm} onSubmit={(event) => void saveRoot(event)}>
          <label><span>Label</span><input value={draft.label} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Photos" aria-label="Media root label" /></label>
          <label className={styles.rootPathField}><span>Path in These</span><input required value={draft.path} onBlur={() => setPathTouched(true)} onChange={(event) => { setDraft((current) => ({ ...current, path: event.target.value })); setPathTouched(true); }} placeholder="/media/photos" aria-label="Path in These" aria-invalid={pathTouched && Boolean(pathError)} aria-describedby={pathTouched && pathError ? "these-path-help these-path-error" : "these-path-help"} /><small id="these-path-help">The application-visible path, for example <code>/media/photos</code>.</small>{pathTouched && pathError ? <small id="these-path-error" className={styles.fieldError} role="alert">{pathError}</small> : null}</label>
          <button className={cx(ui.compactButton, ui.primary)} type="submit" disabled={saving || Boolean(pathError)}>{editingId ? <Pencil size={13} /> : <Plus size={13} />}{saving ? "Saving…" : editingId ? "Save" : "Add root"}</button>
          {editingId ? <button className={cx(ui.iconButton, ui.bordered)} type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft); setPathTouched(false); }} title="Cancel editing" aria-label="Cancel editing"><X size={14} /></button> : null}
        </form>
        <div className={styles.settingsRoots}>
          {bootstrap?.roots.length ? bootstrap.roots.map((root) => <div className={styles.rootRow} key={root.id}>
            <span className={cx(ui.statusDot, root.available ? ui.selected : ui.error)} />
            <strong>{root.label}</strong>
            <code title={root.path}>{root.path}</code>
            <span>{root.available ? "Ready" : "Unavailable"}</span>
            <span className={styles.rootActions}>
              <button type="button" onClick={() => editRoot(root)} aria-label={`Edit ${root.label}`}><Pencil size={13} /></button>
              <button type="button" onClick={() => void deleteRoot(root)} aria-label={`Remove ${root.label}`}><Trash2 size={13} /></button>
            </span>
          </div>) : <p className={styles.rootsEmpty}>No media roots configured yet.</p>}
        </div>
      </section>
    </div></div>
  );
}

function validateThesePath(value: string) {
  if (!value) return "Enter the path seen by These.";
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\")) return null;
  return "Use an absolute application path, such as /media/photos.";
}
