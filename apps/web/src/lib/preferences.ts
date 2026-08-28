import type { ThemePreference } from "@these/shared";

export interface LocalPreferences {
  theme: ThemePreference;
  thumbnailSize: number;
  mobileGalleryDensity: "compact" | "comfortable";
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  rightSidebarOpen: boolean;
  rightSidebarWidth: number;
  showHidden: boolean;
  lastFolder: string | null;
  activeCollectionId: number | null;
  collectionLastFolders: Record<string, string>;
}

const key = "these.preferences.v1";
export const folderSidebarWidth = {
  default: 300,
  min: 220,
  max: 480,
  viewportRatio: 0.42,
  keyboardStep: 16,
} as const;
export const listSidebarWidth = {
  default: 208,
  min: 180,
  max: 480,
  viewportRatio: 0.42,
  keyboardStep: 16,
} as const;
export const browserSidebarLayout = {
  overlayBreakpoint: 980,
  minimumContentWidth: 480,
} as const;

export interface SidebarWidthConfig {
  default: number;
  min: number;
  max: number;
  viewportRatio: number;
  keyboardStep: number;
}

export const defaultPreferences: LocalPreferences = {
  theme: "system",
  thumbnailSize: 180,
  mobileGalleryDensity: "compact",
  leftSidebarOpen: true,
  leftSidebarWidth: folderSidebarWidth.default,
  rightSidebarOpen: true,
  rightSidebarWidth: listSidebarWidth.default,
  showHidden: false,
  lastFolder: null,
  activeCollectionId: null,
  collectionLastFolders: {},
};

export function readPreferences(): LocalPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<LocalPreferences>;
    return {
      ...defaultPreferences,
      ...stored,
      leftSidebarWidth: clampSidebarWidth(stored.leftSidebarWidth, folderSidebarWidth),
      rightSidebarWidth: clampSidebarWidth(stored.rightSidebarWidth, listSidebarWidth),
      mobileGalleryDensity: stored.mobileGalleryDensity === "comfortable" ? "comfortable" : "compact",
      activeCollectionId: positiveIntegerOrNull(stored.activeCollectionId),
      collectionLastFolders: collectionFolderMap(stored.collectionLastFolders),
    };
  } catch {
    return defaultPreferences;
  }
}

export function clampSidebarWidth(value: unknown, config: SidebarWidthConfig, maximum: number = config.max) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : config.default;
  const cappedMaximum = Math.max(config.min, Math.min(maximum, config.max));
  return Math.round(Math.max(config.min, Math.min(numericValue, cappedMaximum)));
}

export function writePreferences(value: LocalPreferences) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are optional when storage is disabled or full.
  }
}

function positiveIntegerOrNull(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function collectionFolderMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([collectionId, folderPath]) => /^\d+$/.test(collectionId) && typeof folderPath === "string" && folderPath.length > 0));
}

export function applyTheme(theme: ThemePreference) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09090b" : "#f5f5f6");
}
