import type { ThemePreference } from "@these/shared";

export interface LocalPreferences {
  theme: ThemePreference;
  thumbnailSize: number;
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  rightSidebarOpen: boolean;
  showHidden: boolean;
  lastFolder: string | null;
}

const key = "these.preferences.v1";
export const folderSidebarWidth = {
  default: 300,
  min: 220,
  max: 480,
  viewportRatio: 0.42,
  keyboardStep: 16,
} as const;

export const defaultPreferences: LocalPreferences = {
  theme: "system",
  thumbnailSize: 180,
  leftSidebarOpen: true,
  leftSidebarWidth: folderSidebarWidth.default,
  rightSidebarOpen: true,
  showHidden: false,
  lastFolder: null,
};

export function readPreferences(): LocalPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<LocalPreferences>;
    return {
      ...defaultPreferences,
      ...stored,
      leftSidebarWidth: clampFolderSidebarWidth(stored.leftSidebarWidth),
    };
  } catch {
    return defaultPreferences;
  }
}

export function clampFolderSidebarWidth(value: unknown, maximum: number = folderSidebarWidth.max) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : folderSidebarWidth.default;
  const cappedMaximum = Math.max(folderSidebarWidth.min, Math.min(maximum, folderSidebarWidth.max));
  return Math.round(Math.max(folderSidebarWidth.min, Math.min(numericValue, cappedMaximum)));
}

export function writePreferences(value: LocalPreferences) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function applyTheme(theme: ThemePreference) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09090b" : "#f5f5f6");
}
