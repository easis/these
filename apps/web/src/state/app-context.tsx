import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BootstrapResponse, ListItemStatus, MediaEntry, TheseList } from "@these/shared";
import { api } from "../lib/api";
import { applyTheme, readPreferences, writePreferences, type LocalPreferences } from "../lib/preferences";

interface AppContextValue {
  bootstrap: BootstrapResponse | null;
  activeList: TheseList | null;
  loading: boolean;
  error: string | null;
  preferences: LocalPreferences;
  refresh: () => Promise<void>;
  setActiveList: (id: number | null) => Promise<void>;
  createList: (name: string) => Promise<TheseList>;
  setItemStatus: (media: MediaEntry, status: ListItemStatus) => Promise<void>;
  removeItem: (mediaPath: string) => Promise<void>;
  setPreferences: (patch: Partial<LocalPreferences>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferencesState] = useState<LocalPreferences>(() => readPreferences());

  const refresh = useCallback(async () => {
    try {
      setBootstrap(await api<BootstrapResponse>("/api/bootstrap"));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    applyTheme(preferences.theme);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme(preferences.theme);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preferences.theme]);

  const setPreferences = useCallback((patch: Partial<LocalPreferences>) => {
    setPreferencesState((current) => {
      const next = { ...current, ...patch };
      writePreferences(next);
      return next;
    });
  }, []);

  const setActiveList = useCallback(async (id: number | null) => {
    await api("/api/settings/active-list", { method: "PUT", body: JSON.stringify({ activeListId: id }) });
    await refresh();
  }, [refresh]);

  const createList = useCallback(async (name: string) => {
    const list = await api<TheseList>("/api/lists", { method: "POST", body: JSON.stringify({ name }) });
    await refresh();
    return list;
  }, [refresh]);

  const activeList = bootstrap?.lists.find((list) => list.id === bootstrap.activeListId) ?? null;

  const setItemStatus = useCallback(async (media: MediaEntry, status: ListItemStatus) => {
    if (!bootstrap?.activeListId) throw new Error("Create or activate a list first.");
    await api(`/api/lists/${bootstrap.activeListId}/items`, {
      method: "PUT",
      body: JSON.stringify({ path: media.path, kind: media.kind, status }),
    });
    await refresh();
  }, [bootstrap?.activeListId, refresh]);

  const removeItem = useCallback(async (mediaPath: string) => {
    if (!bootstrap?.activeListId) return;
    await api(`/api/lists/${bootstrap.activeListId}/items?${new URLSearchParams({ path: mediaPath })}`, { method: "DELETE" });
    await refresh();
  }, [bootstrap?.activeListId, refresh]);

  const value = useMemo<AppContextValue>(() => ({
    bootstrap, activeList, loading, error, preferences, refresh, setActiveList, createList,
    setItemStatus, removeItem, setPreferences,
  }), [bootstrap, activeList, loading, error, preferences, refresh, setActiveList, createList, setItemStatus, removeItem, setPreferences]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
