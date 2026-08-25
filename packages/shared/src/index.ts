export type MediaKind = "image" | "video";
export type ListItemStatus = "selected" | "maybe";
export type ThemePreference = "system" | "light" | "dark";

export interface MediaRoot {
  id: string;
  label: string;
  path: string;
  available: boolean;
}

export interface FolderEntry {
  path: string;
  name: string;
  displayName: string;
  hidden: boolean;
  favorite: boolean;
}

export interface MediaEntry {
  path: string;
  name: string;
  kind: MediaKind;
  size: number;
  modifiedAt: string;
  status: ListItemStatus | null;
}

export interface BrowseResponse {
  path: string;
  root: MediaRoot;
  folders: FolderEntry[];
  media: MediaEntry[];
  totalMedia: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface TheseList {
  id: number;
  name: string;
  selectedCount: number;
  maybeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListItem extends MediaEntry {
  id: number;
  listId: number;
  status: ListItemStatus;
  missing: boolean;
}

export interface FolderMetadata {
  id: number;
  path: string;
  alias: string | null;
  favorite: boolean;
  hidden: boolean;
  status: "ok" | "missing";
  createdAt: string;
  updatedAt: string;
}

export interface BootstrapResponse {
  roots: MediaRoot[];
  lists: TheseList[];
  activeListId: number | null;
  favorites: FolderMetadata[];
}

export interface ApiError {
  error: string;
  code?: string;
}
