import type { ThemePreference } from "@these/shared";

export interface LocalPreferences {
  theme: ThemePreference;
  thumbnailSize: number;
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  rightSidebarOpen: boolean;
  rightSidebarWidth: number;
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
  leftSidebarOpen: true,
  leftSidebarWidth: folderSidebarWidth.default,
  rightSidebarOpen: true,
  rightSidebarWidth: listSidebarWidth.default,
  showHidden: false,
  lastFolder: null,
};

export function readPreferences(): LocalPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<LocalPreferences>;
    return {
      ...defaultPreferences,
      ...stored,
      leftSidebarWidth: clampSidebarWidth(stored.leftSidebarWidth, folderSidebarWidth),
      rightSidebarWidth: clampSidebarWidth(stored.rightSidebarWidth, listSidebarWidth),
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
  localStorage.setItem(key, JSON.stringify(value));
}

export function applyTheme(theme: ThemePreference) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09090b" : "#f5f5f6");
}
