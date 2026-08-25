import type { ThemePreference } from "@these/shared";

export interface LocalPreferences {
  theme: ThemePreference;
  thumbnailSize: number;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  showHidden: boolean;
  lastFolder: string | null;
}

const key = "these.preferences.v1";
export const defaultPreferences: LocalPreferences = {
  theme: "system",
  thumbnailSize: 180,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  showHidden: false,
  lastFolder: null,
};

export function readPreferences(): LocalPreferences {
  try {
    return { ...defaultPreferences, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    return defaultPreferences;
  }
}

export function writePreferences(value: LocalPreferences) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function applyTheme(theme: ThemePreference) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09090b" : "#f5f5f6");
}
