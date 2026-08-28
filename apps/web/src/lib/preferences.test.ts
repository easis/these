import { beforeEach, describe, expect, it } from "vitest";
import { defaultPreferences, folderSidebarWidth, listSidebarWidth, readPreferences } from "./preferences";

describe("local preferences", () => {
  beforeEach(() => localStorage.clear());

  it("adds the default sidebar widths to older saved preferences", () => {
    localStorage.setItem("these.preferences.v1", JSON.stringify({ theme: "dark", leftSidebarOpen: false }));

    expect(readPreferences()).toMatchObject({
      theme: "dark",
      leftSidebarOpen: false,
      leftSidebarWidth: folderSidebarWidth.default,
      rightSidebarWidth: listSidebarWidth.default,
      mobileGalleryDensity: "compact",
      activeCollectionId: null,
      collectionLastFolders: {},
    });
  });

  it("restores only valid mobile gallery density values", () => {
    localStorage.setItem("these.preferences.v1", JSON.stringify({ mobileGalleryDensity: "comfortable" }));
    expect(readPreferences().mobileGalleryDensity).toBe("comfortable");
    localStorage.setItem("these.preferences.v1", JSON.stringify({ mobileGalleryDensity: "dense" }));
    expect(readPreferences().mobileGalleryDensity).toBe("compact");
  });

  it("restores valid collection navigation and ignores malformed saved values", () => {
    localStorage.setItem("these.preferences.v1", JSON.stringify({
      activeCollectionId: 7,
      collectionLastFolders: { 7: "/media/dogs", bad: 14, 9: "" },
    }));
    expect(readPreferences()).toMatchObject({ activeCollectionId: 7, collectionLastFolders: { 7: "/media/dogs" } });

    localStorage.setItem("these.preferences.v1", JSON.stringify({ activeCollectionId: -1, collectionLastFolders: [] }));
    expect(readPreferences()).toMatchObject({ activeCollectionId: null, collectionLastFolders: {} });
  });

  it("clamps invalid and out-of-range saved widths", () => {
    localStorage.setItem("these.preferences.v1", JSON.stringify({ leftSidebarWidth: 999 }));
    expect(readPreferences().leftSidebarWidth).toBe(folderSidebarWidth.max);

    localStorage.setItem("these.preferences.v1", JSON.stringify({ leftSidebarWidth: "wide" }));
    expect(readPreferences().leftSidebarWidth).toBe(defaultPreferences.leftSidebarWidth);

    localStorage.setItem("these.preferences.v1", JSON.stringify({ rightSidebarWidth: 999 }));
    expect(readPreferences().rightSidebarWidth).toBe(listSidebarWidth.max);

    localStorage.setItem("these.preferences.v1", JSON.stringify({ rightSidebarWidth: "wide" }));
    expect(readPreferences().rightSidebarWidth).toBe(defaultPreferences.rightSidebarWidth);
  });
});
