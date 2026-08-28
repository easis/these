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
      [mediaTileCss, ".tileActions button.discardedAction"],
      [viewerCss, ".viewerButton.buttonActive"],
      [viewerCss, ".viewerClassify button.selected"],
      [viewerCss, ".viewerClassify button.maybe"],
      [viewerCss, ".viewerClassify button.discarded"],
      [browsePageCss, ".currentFolderActions button.favorite"],
      [browsePageCss, ".currentFolderActions button.hidden"],
      [browsePageCss, ".mediaKindFilters button.active"],
      [browsePageCss, ".folderMenuTrigger.open"],
      [folderManagerCss, ".metadataFlags button.on"],
    ] as const;

    for (const [css, selector] of stateSelectors) expect(css).toContain(selector);
  });

  it("uses peripheral state rings and dims only the discarded thumbnail", () => {
    expect(mediaTileCss).toMatch(/\.selected::before\s*\{[^}]*border-color:/s);
    expect(mediaTileCss).toMatch(/\.maybe::before\s*\{[^}]*border-style:\s*dashed/s);
    expect(mediaTileCss).not.toMatch(/inset:\s*0 auto 0 0/);
    expect(mediaTileCss).toMatch(/\.discarded \.mediaOpen img\s*\{[^}]*opacity:\s*\.52[^}]*filter:/s);
    expect(mediaTileCss).toMatch(/\.mediaTile:focus-within\s*\{[^}]*outline:\s*2px solid[^}]*outline-offset:\s*2px/s);
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
