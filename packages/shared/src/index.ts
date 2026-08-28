export type MediaKind = "image" | "video";
export type ListItemStatus = "selected" | "maybe" | "discarded";
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

export interface MediaFileMetadata {
  name: string;
  rootLabel: string;
  relativePath: string;
  extension: string;
  mimeType: string;
  size: number;
  modifiedAt: string;
}

export interface ImageTechnicalMetadata {
  format: string;
  width: number;
  height: number;
  megapixels: number;
  orientation?: number;
  colorSpace?: string;
  channels?: number;
  depth?: string;
  bitsPerSample?: number;
  densityDpi?: number;
  hasAlpha?: boolean;
  hasProfile?: boolean;
  isProgressive?: boolean;
  chromaSubsampling?: string;
  compression?: string;
  frameCount?: number;
}

export interface CaptureMetadata {
  capturedAt?: string;
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  exposureTimeSeconds?: number;
  aperture?: number;
  iso?: number;
  focalLengthMm?: number;
  focalLength35mm?: number;
  exposureBiasEv?: number;
  flash?: string;
  whiteBalance?: string;
  meteringMode?: string;
  exposureProgram?: string;
  software?: string;
  artist?: string;
  copyright?: string;
  description?: string;
  keywords?: string[];
}

export interface LocationMetadata {
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
}

export interface VideoStreamMetadata {
  index: number;
  codec?: string;
  codecLongName?: string;
  profile?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  pixelFormat?: string;
  colorSpace?: string;
  colorTransfer?: string;
  colorPrimaries?: string;
  bitRate?: number;
  durationSeconds?: number;
  language?: string;
}

export interface AudioStreamMetadata {
  index: number;
  codec?: string;
  codecLongName?: string;
  profile?: string;
  sampleRateHz?: number;
  channels?: number;
  channelLayout?: string;
  bitRate?: number;
  durationSeconds?: number;
  language?: string;
}

export interface VideoTechnicalMetadata {
  container?: string;
  containerLongName?: string;
  durationSeconds?: number;
  bitRate?: number;
  videoStreams: VideoStreamMetadata[];
  audioStreams: AudioStreamMetadata[];
}

export interface MediaMetadataResponse {
  kind: MediaKind;
  file: MediaFileMetadata;
  image?: ImageTechnicalMetadata;
  capture?: CaptureMetadata;
  location?: LocationMetadata;
  video?: VideoTechnicalMetadata;
  warnings: string[];
}

export interface BrowseResponse {
  path: string;
  root: MediaRoot;
  currentFolder: FolderEntry;
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
  discardedCount: number;
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

export interface FolderCollection {
  id: number;
  name: string;
  folderCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionFolder {
  path: string;
  name: string;
  displayName: string;
  hidden: boolean;
  favorite: boolean;
  status: "ready" | "root-unavailable" | "unavailable";
}

export interface FolderCollectionDetail extends FolderCollection {
  folders: CollectionFolder[];
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
