import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { CollectionFolder, FolderCollection, FolderCollectionDetail } from "@these/shared";
import { ApiRequestError, api, isAbortError, query } from "../lib/api";
import type { LocalPreferences } from "../lib/preferences";

interface CollectionScopeOptions {
  search: string;
  navigate: NavigateFunction;
  preferences: LocalPreferences;
  setPreferences: (patch: Partial<LocalPreferences>) => void;
}

export function useCollectionScope({ search, navigate, preferences, setPreferences }: CollectionScopeOptions) {
  const parameters = useMemo(() => new URLSearchParams(search), [search]);
  const pathParameter = parameters.get("path");
  const rawCollectionId = parameters.get("collection");
  const queryCollectionId = parseCollectionId(rawCollectionId);
  const storedCollectionId = preferences.activeCollectionId ?? null;
  const storedCollectionPaths = preferences.collectionLastFolders ?? {};
  const collectionId = rawCollectionId === null && pathParameter === null ? storedCollectionId : queryCollectionId;
  const [collections, setCollections] = useState<FolderCollection[]>([]);
  const [loadedCollection, setLoadedCollection] = useState<FolderCollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [summariesRequested, setSummariesRequested] = useState(false);
  const [summariesLoaded, setSummariesLoaded] = useState(false);
  const collectionLastFoldersRef = useRef(storedCollectionPaths);
  const pathParameterRef = useRef(pathParameter);
  collectionLastFoldersRef.current = storedCollectionPaths;
  pathParameterRef.current = pathParameter;
  const activeCollection = loadedCollection?.id === collectionId ? loadedCollection : null;
  const rememberedPath = collectionId ? storedCollectionPaths[String(collectionId)] ?? null : null;

  useEffect(() => {
    if (rawCollectionId === null || queryCollectionId !== null) return;
    setNotice("That collection link is invalid. Showing all folders.");
    setPreferences({ activeCollectionId: null });
    navigate(browseUrl(pathParameter), { replace: true });
  }, [navigate, pathParameter, queryCollectionId, rawCollectionId, setPreferences]);

  useEffect(() => {
    if (collectionId === null && pathParameter !== null && storedCollectionId !== null) {
      setPreferences({ activeCollectionId: null });
    }
  }, [collectionId, pathParameter, setPreferences, storedCollectionId]);

  useEffect(() => {
    if (collectionId === null && !summariesRequested) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (collectionId !== null) setLoadedCollection(null);
    const summaries = api<FolderCollection[]>("/api/collections", { signal: controller.signal });
    const detail = collectionId === null
      ? Promise.resolve<FolderCollectionDetail | null>(null)
      : api<FolderCollectionDetail>(`/api/collections/${collectionId}`, { signal: controller.signal });
    void Promise.all([summaries, detail])
      .then(([nextCollections, nextCollection]) => {
        if (controller.signal.aborted) return;
        setCollections(Array.isArray(nextCollections) ? nextCollections : []);
        setSummariesLoaded(true);
        setLoadedCollection(nextCollection);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        if (collectionId !== null && caught instanceof ApiRequestError && caught.code === "COLLECTION_NOT_FOUND") {
          setNotice("That collection no longer exists. Showing all folders.");
          setPreferences({
            activeCollectionId: null,
            collectionLastFolders: withoutCollectionPath(collectionLastFoldersRef.current, collectionId),
          });
          navigate(browseUrl(pathParameterRef.current), { replace: true });
          return;
        }
        setError(caught instanceof Error ? caught.message : "Could not load collections.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [collectionId, navigate, revision, setPreferences, summariesRequested]);

  const visibleFolders = useMemo(() => activeCollection?.folders.filter((folder) => folder.status === "ready" && (preferences.showHidden || !folder.hidden)) ?? [], [activeCollection, preferences.showHidden]);
  const requestedPath = collectionId === null
    ? null
    : pathParameter && findContainingCollectionFolder(pathParameter, visibleFolders) ? pathParameter : null;
  const scopeRoot = requestedPath ? findContainingCollectionFolder(requestedPath, visibleFolders) : undefined;

  useEffect(() => {
    if (collectionId === null || !activeCollection) return;
    const currentIsValid = pathParameter !== null && Boolean(findContainingCollectionFolder(pathParameter, visibleFolders));
    const rememberedIsValid = rememberedPath !== null && Boolean(findContainingCollectionFolder(rememberedPath, visibleFolders));
    const nextPath = currentIsValid ? pathParameter : rememberedIsValid ? rememberedPath : visibleFolders[0]?.path ?? null;
    setPreferences({ activeCollectionId: collectionId });
    if (pathParameter !== nextPath || rawCollectionId === null) {
      navigate(browseUrl(nextPath, collectionId), { replace: true });
    }
  }, [activeCollection, collectionId, navigate, pathParameter, rawCollectionId, rememberedPath, setPreferences, visibleFolders]);

  const selectCollection = useCallback((nextCollectionId: number | null, currentPath: string | null) => {
    setNotice(null);
    setError(null);
    if (nextCollectionId === null) {
      setPreferences({ activeCollectionId: null });
      navigate(browseUrl(currentPath));
      return;
    }
    setPreferences({ activeCollectionId: nextCollectionId });
    navigate(browseUrl(null, nextCollectionId));
  }, [navigate, setPreferences]);

  const refreshCollectionScope = useCallback(() => setRevision((value) => value + 1), []);
  const requestCollections = useCallback(() => {
    if (collectionId === null && !summariesLoaded) setSummariesRequested(true);
  }, [collectionId, summariesLoaded]);

  return {
    collectionId,
    collections,
    activeCollection,
    visibleFolders,
    requestedPath,
    scopeRoot,
    loading,
    error: notice ?? error,
    selectCollection,
    refreshCollectionScope,
    requestCollections,
  };
}

export function browseUrl(folderPath: string | null, collectionId?: number | null) {
  const search = query({ collection: collectionId, path: folderPath });
  return search ? `/browse?${search}` : "/browse";
}

export function findContainingCollectionFolder(folderPath: string, folders: CollectionFolder[]) {
  let result: CollectionFolder | undefined;
  for (const folder of folders) {
    if (!isSameOrDescendantPath(folderPath, folder.path)) continue;
    if (!result || folder.path.length > result.path.length) result = folder;
  }
  return result;
}

function isSameOrDescendantPath(folderPath: string, ancestorPath: string) {
  if (folderPath === ancestorPath) return true;
  if (ancestorPath.endsWith("/") || ancestorPath.endsWith("\\")) return folderPath.startsWith(ancestorPath);
  return folderPath.startsWith(`${ancestorPath}/`) || folderPath.startsWith(`${ancestorPath}\\`);
}

function parseCollectionId(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function withoutCollectionPath(paths: Record<string, string>, collectionId: number) {
  const next = { ...paths };
  delete next[String(collectionId)];
  return next;
}
