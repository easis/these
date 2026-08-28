import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShellCss = readCss("../components/AppShell.module.css");
const listSidebarCss = readCss("../components/ListSidebar.module.css");
const mediaTileCss = readCss("../components/MediaTile.module.css");
const viewerCss = readCss("../components/Viewer.module.css");
const browsePageCss = readCss("../pages/BrowsePage.module.css");
const folderTreeCss = readCss("../components/FolderTree.module.css");
const folderManagerCss = readCss("../pages/FolderManagerPage.module.css");
const uiCss = readCss("./ui.module.css");

describe("CSS Module modifier precedence", () => {
  it("keeps primary button colors on hover", () => {
    expect(uiCss).toMatch(
      /\.compactButton\.primary,\s*\.compactButton\.primary:hover\s*\{[^}]*background:\s*var\(--accent\)/s,
    );
  });

  it("keeps deliberate visual states more specific than their hover rules", () => {
    const stateSelectors = [
      [appShellCss, ".themeSwitcher button.themeActive"],
      [listSidebarCss, ".listRow.active"],
      [mediaTileCss, ".tileActions button.selectedAction"],
      [mediaTileCss, ".tileActions button.maybeAction"],
      [viewerCss, ".viewerButton.buttonActive"],
      [viewerCss, ".viewerClassify button.selected"],
      [viewerCss, ".viewerClassify button.maybe"],
      [browsePageCss, ".currentFolderActions button.favorite"],
      [browsePageCss, ".currentFolderActions button.hidden"],
      [browsePageCss, ".mediaKindFilters button.active"],
      [browsePageCss, ".folderMenuTrigger.open"],
      [folderManagerCss, ".metadataFlags button.on"],
    ] as const;

    for (const [css, selector] of stateSelectors) expect(css).toContain(selector);
  });

  it("prevents the active-list ring from shrinking", () => {
    const activeRing = uiCss.match(/\.activeRing\s*\{([^}]*)\}/s)?.[1];
    expect(activeRing).toContain("flex: none");
  });

  it("keeps the virtual gallery on the Browse scroll container", () => {
    const virtualGallery = browsePageCss.match(/\.virtualGalleryScroll\s*\{([^}]*)\}/s)?.[1];
    expect(virtualGallery).not.toContain("height:");
    expect(virtualGallery).not.toContain("overflow-y:");
    expect(browsePageCss).not.toContain("100dvh - 180px");
  });

  it("keeps folder action triggers visible on touch interfaces", () => {
    expect(browsePageCss).toMatch(/@media \(hover: none\), \(pointer: coarse\)[\s\S]*\.folderMenuTrigger\s*\{[^}]*visibility:\s*visible/);
    expect(folderTreeCss).toMatch(/@media \(hover: none\), \(pointer: coarse\)[\s\S]*\.treeMenuTrigger\s*\{[^}]*visibility:\s*visible/);
  });
});

function readCss(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
