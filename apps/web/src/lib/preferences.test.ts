import { beforeEach, describe, expect, it } from "vitest";
import { defaultPreferences, folderSidebarWidth, readPreferences } from "./preferences";

describe("local preferences", () => {
  beforeEach(() => localStorage.clear());

  it("adds the default folder sidebar width to older saved preferences", () => {
    localStorage.setItem("these.preferences.v1", JSON.stringify({ theme: "dark", leftSidebarOpen: false }));

    expect(readPreferences()).toMatchObject({
      theme: "dark",
      leftSidebarOpen: false,
      leftSidebarWidth: folderSidebarWidth.default,
    });
  });

  it("clamps invalid and out-of-range saved widths", () => {
    localStorage.setItem("these.preferences.v1", JSON.stringify({ leftSidebarWidth: 999 }));
    expect(readPreferences().leftSidebarWidth).toBe(folderSidebarWidth.max);

    localStorage.setItem("these.preferences.v1", JSON.stringify({ leftSidebarWidth: "wide" }));
    expect(readPreferences().leftSidebarWidth).toBe(defaultPreferences.leftSidebarWidth);
  });
});
