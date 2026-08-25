import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { MediaRoot } from "@these/shared";
import { AppName } from "../components/AppName";
import { api } from "../lib/api";
import { useApp } from "../state/app-context";

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

  const saveRoot = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.path.trim()) return;
    setSaving(true);
    try {
      await api(editingId ? `/api/settings/media-roots/${editingId}` : "/api/settings/media-roots", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(draft),
      });
      setDraft(emptyDraft);
      setEditingId(null);
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
    <div className="page-scroll"><div className="content-page narrow">
      <div className="page-title-row"><div><p className="eyebrow">This browser</p><h1>Settings</h1><p>Gallery preferences stay in this browser. Lists and media roots are stored in <AppName />.</p></div></div>
      <section className="settings-section"><h2>Gallery</h2><p>Default thumbnail width. You can also change this from the gallery toolbar.</p><label className="setting-range"><span>Thumbnail size</span><input type="range" min="120" max="280" step="20" value={preferences.thumbnailSize} onChange={(event) => setPreferences({ thumbnailSize: Number(event.target.value) })} /><output>{preferences.thumbnailSize}px</output></label><label className="setting-check"><input type="checkbox" checked={preferences.showHidden} onChange={(event) => setPreferences({ showHidden: event.target.checked })} /><span>Show hidden folders</span></label></section>
      <section className="settings-section">
        <h2>Media roots</h2>
        <p>Add the absolute container paths where media is mounted. Missing mounts remain configured and are marked unavailable.</p>
        {error ? <div className="inline-error settings-root-error">{error}</div> : null}
        <form className="settings-root-form" onSubmit={(event) => void saveRoot(event)}>
          <label><span>Label</span><input value={draft.label} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Photos" aria-label="Media root label" /></label>
          <label className="root-path-field"><span>Absolute path</span><input required value={draft.path} onChange={(event) => setDraft((current) => ({ ...current, path: event.target.value }))} placeholder="/media/photos" aria-label="Media root path" /></label>
          <button className="compact-button primary" type="submit" disabled={saving || !draft.path.trim()}>{editingId ? <Pencil size={13} /> : <Plus size={13} />}{saving ? "Saving…" : editingId ? "Save" : "Add root"}</button>
          {editingId ? <button className="icon-button bordered" type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft); }} aria-label="Cancel editing"><X size={14} /></button> : null}
        </form>
        <div className="settings-roots">
          {bootstrap?.roots.length ? bootstrap.roots.map((root) => <div className="settings-root-row" key={root.id}>
            <span className={`status-dot ${root.available ? "is-selected" : "is-error"}`} />
            <strong>{root.label}</strong>
            <code title={root.path}>{root.path}</code>
            <span>{root.available ? "Ready" : "Unavailable"}</span>
            <span className="settings-root-actions">
              <button type="button" onClick={() => editRoot(root)} aria-label={`Edit ${root.label}`}><Pencil size={13} /></button>
              <button type="button" onClick={() => void deleteRoot(root)} aria-label={`Remove ${root.label}`}><Trash2 size={13} /></button>
            </span>
          </div>) : <p className="settings-roots-empty">No media roots configured yet.</p>}
        </div>
      </section>
    </div></div>
  );
}
