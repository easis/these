import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { BrowseResponse } from "@these/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FolderTree } from "./FolderTree";
import styles from "./FolderTree.module.css";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  leftSidebarWidth: 300,
  rightSidebarOpen: true,
  setPreferences: vi.fn(),
  showHidden: false,
  favorites: [] as Array<{ id: number; path: string; alias: string | null; favorite: boolean; hidden: boolean; status: "ok"; createdAt: string; updatedAt: string }>,
}));

vi.mock("../lib/api", async () => ({
  ...await vi.importActual<typeof import("../lib/api")>("../lib/api"),
  api: mocks.api,
}));

vi.mock("../state/app-context", () => ({
  useApp: () => ({
    bootstrap: {
      roots: [{ id: "library", label: "Library", path: "/media", available: true }],
      favorites: mocks.favorites,
    },
    preferences: { leftSidebarWidth: mocks.leftSidebarWidth, rightSidebarOpen: mocks.rightSidebarOpen, showHidden: mocks.showHidden },
    setPreferences: mocks.setPreferences,
  }),
}));

describe("FolderTree", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.leftSidebarWidth = 300;
    mocks.rightSidebarOpen = true;
    mocks.setPreferences.mockReset();
    mocks.showHidden = false;
    mocks.favorites = [];
    vi.stubGlobal("innerWidth", 1280);
  });

  it("reloads expanded branches for Show hidden and ignores the obsolete response", async () => {
    const requests: Array<{ url: string; resolve: (response: BrowseResponse) => void }> = [];
    mocks.api.mockImplementation((url: string) => new Promise<BrowseResponse>((resolve) => requests.push({ url, resolve })));
    const { rerender } = render(<FolderTree currentPath="/media/current" />, { wrapper: MemoryRouter });
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(new URL(requests[0]!.url, "http://these.test").searchParams.get("showHidden")).toBe("false");

    mocks.showHidden = true;
    rerender(<FolderTree currentPath="/media/current" />);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(new URL(requests[1]!.url, "http://these.test").searchParams.get("showHidden")).toBe("true");

    await act(async () => requests[1]!.resolve(treeResponse("Hidden child", "/media/hidden")));
    expect(await screen.findByText("Hidden child")).toBeInTheDocument();

    await act(async () => requests[0]!.resolve(treeResponse("Old child", "/media/old")));
    expect(screen.getByText("Hidden child")).toBeInTheDocument();
    expect(screen.queryByText("Old child")).not.toBeInTheDocument();
  });

  it("marks hidden tree rows and visible hidden favorites", async () => {
    mocks.showHidden = true;
    mocks.favorites = [{ id: 1, path: "/media/favorite", alias: "Hidden favorite", favorite: true, hidden: true, status: "ok", createdAt: "", updatedAt: "" }];
    mocks.api.mockResolvedValue(treeResponse("Hidden child", "/media/hidden", true));

    render(<FolderTree currentPath="/media/current" />, { wrapper: MemoryRouter });

    expect((await screen.findByText("Hidden child")).closest(`.${styles.treeRow}`)).toHaveClass(styles.hidden!);
    expect(screen.getByRole("button", { name: "Hidden favorite" })).toHaveClass(styles.hidden!);
  });

  it("applies hidden overrides immediately to cached tree nodes", async () => {
    mocks.api.mockResolvedValue(treeResponse("Photos", "/media/photos"));
    const { rerender } = render(<FolderTree currentPath="/media/current" />, { wrapper: MemoryRouter });
    expect(await screen.findByTitle("/media/photos")).toBeInTheDocument();

    rerender(<FolderTree currentPath="/media/current" hiddenOverrides={new Map([["/media/photos", true]])} />);
    expect(screen.queryByTitle("/media/photos")).not.toBeInTheDocument();

    mocks.showHidden = true;
    rerender(<FolderTree currentPath="/media/current" hiddenOverrides={new Map([["/media/photos", true]])} />);
    expect(screen.getByTitle("/media/photos").closest(`.${styles.treeRow}`)).toHaveClass(styles.hidden!);

    rerender(<FolderTree currentPath="/media/current" hiddenOverrides={new Map([["/media/photos", false]])} />);
    expect(screen.getByTitle("/media/photos").closest(`.${styles.treeRow}`)).not.toHaveClass(styles.hidden!);
  });

  it("applies an ancestral hidden override to descendant favorites", () => {
    mocks.favorites = [{ id: 1, path: "/media/photos/trip", alias: "Trip", favorite: true, hidden: false, status: "ok", createdAt: "", updatedAt: "" }];
    mocks.api.mockResolvedValue(treeResponse("Photos", "/media/photos"));
    const overrides = new Map<string, boolean>([["/media/photos", true], ["/media/photos/trip", false]]);
    const { rerender } = render(<FolderTree currentPath="/media" hiddenOverrides={overrides} />, { wrapper: MemoryRouter });

    expect(screen.queryByRole("button", { name: "Trip" })).not.toBeInTheDocument();

    mocks.showHidden = true;
    rerender(<FolderTree currentPath="/media" hiddenOverrides={overrides} />);
    expect(screen.getByRole("button", { name: "Trip" })).toHaveClass(styles.hidden!);
  });

  it("notifies the parent after navigating to a folder", () => {
    const onNavigate = vi.fn();
    render(<FolderTree currentPath={null} onNavigate={onNavigate} />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByTitle("/media"));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("exposes an accessible desktop separator and resizes with the keyboard", () => {
    render(<FolderTree currentPath={null} />, { wrapper: MemoryRouter });

    const sidebar = screen.getByRole("complementary", { name: "Folders" });
    const resize = screen.getByRole("separator", { name: "Resize folder sidebar" });
    expect(sidebar.style.getPropertyValue("--sidebar-width")).toBe("300px");
    expect(resize).toHaveAttribute("aria-valuemin", "220");
    expect(resize).toHaveAttribute("aria-valuemax", "400");
    expect(resize).toHaveAttribute("aria-valuenow", "300");

    fireEvent.keyDown(resize, { key: "ArrowRight" });
    expect(mocks.setPreferences).toHaveBeenLastCalledWith({ leftSidebarWidth: 316 });
    expect(resize).toHaveAttribute("aria-valuenow", "316");

    fireEvent.keyDown(resize, { key: "Home" });
    expect(mocks.setPreferences).toHaveBeenLastCalledWith({ leftSidebarWidth: 220 });

    fireEvent.keyDown(resize, { key: "End" });
    expect(mocks.setPreferences).toHaveBeenLastCalledWith({ leftSidebarWidth: 400 });
  });

  it("resizes with the pointer and preserves the transient width across rerenders", () => {
    const { rerender } = render(<FolderTree currentPath={null} />, { wrapper: MemoryRouter });
    const resize = screen.getByRole("separator", { name: "Resize folder sidebar" });

    fireEvent(resize, pointerEvent("pointerdown", { button: 0, pointerId: 4, clientX: 300 }));
    fireEvent(resize, pointerEvent("pointermove", { pointerId: 4, clientX: 390 }));
    expect(mocks.setPreferences).not.toHaveBeenCalled();
    expect(resize).toHaveAttribute("aria-valuenow", "390");

    rerender(<FolderTree currentPath={null} />);
    fireEvent(resize, pointerEvent("pointerup", { pointerId: 4, clientX: 390 }));
    expect(mocks.setPreferences).toHaveBeenCalledOnce();
    expect(mocks.setPreferences).toHaveBeenCalledWith({ leftSidebarWidth: 390 });
  });

  it("caps a saved width to 42 percent of a narrower desktop viewport", () => {
    mocks.leftSidebarWidth = 480;
    vi.stubGlobal("innerWidth", 800);
    render(<FolderTree currentPath={null} />, { wrapper: MemoryRouter });

    const sidebar = screen.getByRole("complementary", { name: "Folders" });
    const resize = screen.getByRole("separator", { name: "Resize folder sidebar" });
    expect(sidebar.style.getPropertyValue("--sidebar-width")).toBe("336px");
    expect(resize).toHaveAttribute("aria-valuemax", "336");
    expect(resize).toHaveAttribute("aria-valuenow", "336");
  });

  it("does not render the desktop separator in the compact modal", () => {
    render(<FolderTree currentPath={null} modal />, { wrapper: MemoryRouter });
    expect(screen.queryByRole("separator", { name: "Resize folder sidebar" })).not.toBeInTheDocument();
  });
});

function treeResponse(name: string, folderPath: string, hidden = false): BrowseResponse {
  return {
    path: "/media",
    root: { id: "library", label: "Library", path: "/media", available: true },
    currentFolder: { path: "/media", name: "media", displayName: "Library", hidden: false, favorite: false },
    folders: [{ path: folderPath, name, displayName: name, hidden, favorite: false }],
    media: [],
    totalMedia: 0,
    offset: 0,
    limit: 1,
    hasMore: false,
  };
}

function pointerEvent(type: string, values: { button?: number; pointerId: number; clientX: number }) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    button: { value: values.button ?? 0 },
    pointerId: { value: values.pointerId },
    clientX: { value: values.clientX },
  });
  return event;
}
