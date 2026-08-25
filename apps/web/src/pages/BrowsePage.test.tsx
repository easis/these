import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import type { BrowseResponse } from "@these/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowsePage } from "./BrowsePage";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  setPreferences: vi.fn(),
  setItemStatus: vi.fn(),
  removeItem: vi.fn(),
  refresh: vi.fn(),
  preferences: {
    theme: "light",
    thumbnailSize: 180,
    leftSidebarOpen: false,
    rightSidebarOpen: false,
    showHidden: false,
    lastFolder: null as string | null,
  },
}));

vi.mock("../lib/api", async () => ({
  ...await vi.importActual<typeof import("../lib/api")>("../lib/api"),
  api: mocks.api,
}));

vi.mock("../state/app-context", () => ({
  useApp: () => ({
    bootstrap: {
      roots: [{ id: "library", label: "Library", path: "/media", available: true }],
      lists: [],
      activeListId: null,
      favorites: [],
    },
    activeList: null,
    loading: false,
    error: null,
    preferences: mocks.preferences,
    setPreferences: mocks.setPreferences,
    setItemStatus: mocks.setItemStatus,
    removeItem: mocks.removeItem,
    refresh: mocks.refresh,
  }),
}));

describe("BrowsePage requests", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.setPreferences.mockReset();
    mocks.refresh.mockReset();
    Object.assign(mocks.preferences, {
      theme: "light",
      thumbnailSize: 180,
      leftSidebarOpen: false,
      rightSidebarOpen: false,
      showHidden: false,
      lastFolder: null,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("closes the lists sidebar when an overlapping layout becomes compact", () => {
    let changeListener: (() => void) | undefined;
    const compactViewport = {
      matches: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => { changeListener = listener; }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => compactViewport));
    mocks.preferences.leftSidebarOpen = true;
    mocks.preferences.rightSidebarOpen = true;
    mocks.api.mockResolvedValue(browseResponse("/media", 0));

    const { unmount } = render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    expect(compactViewport.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(mocks.setPreferences).not.toHaveBeenCalledWith({ rightSidebarOpen: false });

    compactViewport.matches = true;
    act(() => changeListener?.());
    expect(mocks.setPreferences).toHaveBeenCalledWith({ rightSidebarOpen: false });

    unmount();
    expect(compactViewport.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("does not let a slow response from the previous folder replace the current one", async () => {
    const pending = new Map<string, (response: BrowseResponse) => void>();
    mocks.api.mockImplementation((url: string) => new Promise<BrowseResponse>((resolve) => {
      pending.set(new URL(url, "http://these.test").searchParams.get("path")!, resolve);
    }));

    render(
      <MemoryRouter initialEntries={["/browse?path=%2Fmedia%2Fold"]}>
        <NavigationHarness />
      </MemoryRouter>,
    );
    await waitFor(() => expect(pending.has("/media/old")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Open new folder" }));
    await waitFor(() => expect(pending.has("/media/new")).toBe(true));

    await act(async () => pending.get("/media/new")!(browseResponse("/media/new", 22)));
    expect(await screen.findByText("22 media · 0 folders")).toBeInTheDocument();

    await act(async () => pending.get("/media/old")!(browseResponse("/media/old", 11)));
    expect(screen.getByText("22 media · 0 folders")).toBeInTheDocument();
    expect(screen.queryByText("11 media · 0 folders")).not.toBeInTheDocument();
  });

  it("sends the filename filter to the backend and keeps server pagination", async () => {
    mocks.api.mockImplementation(async (url: string) => {
      const parameters = new URL(url, "http://these.test").searchParams;
      const filter = parameters.get("filter") ?? "";
      const offset = Number(parameters.get("offset"));
      return browseResponse("/media", 2, {
        offset,
        limit: 1,
        hasMore: offset === 0,
        media: [{
          path: `/media/${filter || "all"}-${offset}.jpg`,
          name: `${filter || "all"}-${offset}.jpg`,
          kind: "image",
          size: 1,
          modifiedAt: "2026-01-01T00:00:00.000Z",
          status: null,
        }],
      });
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    expect(await screen.findByText("2 media · 0 folders")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter filenames"), { target: { value: "Cat" } });
    await waitFor(() => expect(mocks.api.mock.calls.some(([url]) => new URL(url as string, "http://these.test").searchParams.get("filter") === "Cat")).toBe(true));

    const loadMore = await screen.findByRole("button", { name: "Load more" });
    fireEvent.click(loadMore);
    await waitFor(() => expect(mocks.api.mock.calls.some(([url]) => {
      const parameters = new URL(url as string, "http://these.test").searchParams;
      return parameters.get("filter") === "Cat" && parameters.get("offset") === "1";
    })).toBe(true));
  });

  it("shows subfolders without an incorrect empty-media message", async () => {
    mocks.api.mockResolvedValue(browseResponse("/media", 0, {
      folders: [{
        path: "/media/photos",
        name: "photos",
        displayName: "Photos",
        hidden: false,
        favorite: false,
      }],
    }));

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: /Photos/ })).toBeInTheDocument();
    expect(screen.queryByText("No media in this folder.")).not.toBeInTheDocument();
  });

  it("filters images and videos independently while keeping one type active", async () => {
    mocks.api.mockResolvedValue(browseResponse("/media", 0));
    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);

    const images = await screen.findByRole("button", { name: "Images" });
    const videos = screen.getByRole("button", { name: "Videos" });
    expect(mocks.api.mock.calls.some(([url]) => new URL(url as string, "http://these.test").searchParams.get("kinds") === "image,video")).toBe(true);

    fireEvent.click(images);
    await waitFor(() => expect(mocks.api.mock.calls.some(([url]) => new URL(url as string, "http://these.test").searchParams.get("kinds") === "video")).toBe(true));
    fireEvent.click(videos);
    expect(videos).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTitle("Show hidden folders"));
    expect(mocks.setPreferences).toHaveBeenCalledWith({ showHidden: true });
  });

  it("updates the current folder and returns to its parent after hiding it", async () => {
    mocks.api.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return {};
      const folderPath = new URL(url, "http://these.test").searchParams.get("path") ?? "/media";
      return browseResponse(folderPath, 0);
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia%2Fphotos"]}><BrowsePage /><LocationProbe /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Add current folder to favorites" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/folder-metadata", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ path: "/media/photos", favorite: true }),
    })));

    fireEvent.click(await screen.findByRole("button", { name: "Edit current folder alias" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Alias for photos" }), { target: { value: "Portfolio" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/folder-metadata", expect.objectContaining({
      body: JSON.stringify({ path: "/media/photos", alias: "Portfolio" }),
    })));

    fireEvent.click(await screen.findByRole("button", { name: "Hide current folder" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/browse?path=%2Fmedia"));
  });

  it("does not hide a media root and can restore a hidden subfolder", async () => {
    mocks.api.mockResolvedValue(browseResponse("/media", 0, {
      folders: [{ path: "/media/hidden", name: "hidden", displayName: "Hidden", hidden: true, favorite: false }],
    }));
    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: "Hide current folder" })).toBeDisabled();
    const unhide = screen.getByRole("button", { name: "Unhide folder" });
    expect(unhide.closest(".folder-item")).toHaveClass("is-hidden");
    fireEvent.click(unhide);
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/folder-metadata", expect.objectContaining({
      body: JSON.stringify({ path: "/media/hidden", hidden: false }),
    })));
  });
});

function NavigationHarness() {
  const navigate = useNavigate();
  return <><button type="button" onClick={() => navigate("/browse?path=%2Fmedia%2Fnew")}>Open new folder</button><BrowsePage /></>;
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
}

function browseResponse(folderPath: string, totalMedia: number, overrides: Partial<BrowseResponse> = {}): BrowseResponse {
  return {
    path: folderPath,
    root: { id: "library", label: "Library", path: "/media", available: true },
    currentFolder: {
      path: folderPath,
      name: folderPath === "/media" ? "Library" : folderPath.split("/").pop() ?? "media",
      displayName: folderPath === "/media" ? "Library" : folderPath.split("/").pop() ?? "Library",
      hidden: false,
      favorite: false,
    },
    folders: [],
    media: [],
    totalMedia,
    offset: 0,
    limit: 180,
    hasMore: false,
    ...overrides,
  };
}
