import { ListPlus } from "lucide-react";
import { useState } from "react";
import { useApp } from "../state/app-context";

export function ActiveListControl() {
  const { bootstrap, activeList, setActiveList, createList } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  if (creating) {
    return (
      <form className="flex items-center gap-1" onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        await createList(name);
        setName("");
        setCreating(false);
      }}>
        <input autoFocus className="compact-input w-36" value={name} maxLength={100} placeholder="List name" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Escape") setCreating(false);
        }} />
        <button className="compact-button" type="submit">Create</button>
      </form>
    );
  }

  return (
    <div className="active-list-control">
      <span className="status-dot is-selected" aria-hidden="true" />
      <label htmlFor="active-list" className="text-muted">Active</label>
      <select id="active-list" value={activeList?.id ?? ""} onChange={(event) => void setActiveList(event.target.value ? Number(event.target.value) : null)}>
        <option value="">No active list</option>
        {bootstrap?.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
      </select>
      <button className="icon-button" type="button" title="Create list" aria-label="Create list" onClick={() => setCreating(true)}>
        <ListPlus size={15} />
      </button>
    </div>
  );
}
