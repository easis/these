import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import type { BrowseResponse, TheseList } from "@these/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowsePage } from "./BrowsePage";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  setPreferences: vi.fn(),
  setItemStatus: vi.fn(),
  removeItem: vi.fn(),
  refresh: vi.fn(),
  activeList: null as TheseList | null,
  preferences: {
    theme: "light",
    thumbnailSize: 180,
    leftSidebarOpen: false,
    rightSidebarOpen: false,
    showHidden: false,
    lastFolder: null as string | null,
  },
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 220,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ key: index, index, start: index * 220, size: 220 })),
  }),
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
    activeList: mocks.activeList,
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
    mocks.setItemStatus.mockReset();
    mocks.removeItem.mockReset();
    mocks.refresh.mockReset();
    mocks.activeList = null;
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

  it("clears the previous gallery only when navigating to another folder", async () => {
    const nextFolder = deferred<BrowseResponse>();
    mocks.api.mockImplementation((url: string) => {
      const folderPath = new URL(url, "http://these.test").searchParams.get("path");
      return folderPath === "/media/new" ? nextFolder.promise : Promise.resolve(browseResponse("/media/old", 1, { media: [mediaEntry("/media/old/old.jpg")] }));
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia%2Fold"]}><NavigationHarness /></MemoryRouter>);
    expect(await screen.findByText("old.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open new folder" }));

    expect(await screen.findByText("Opening folder…")).toBeInTheDocument();
    expect(screen.queryByText("old.jpg")).not.toBeInTheDocument();

    nextFolder.resolve(browseResponse("/media/new", 1, { media: [mediaEntry("/media/new/new.jpg")] }));
    expect(await screen.findByText("new.jpg")).toBeInTheDocument();
  });

  it("keeps the current gallery mounted while a same-folder filter revalidates", async () => {
    const filtered = deferred<BrowseResponse>();
    let requests = 0;
    mocks.api.mockImplementation(() => {
      requests += 1;
      return requests === 1
        ? Promise.resolve(browseResponse("/media", 1, { media: [mediaEntry("/media/old.jpg")] }))
        : filtered.promise;
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    expect(await screen.findByText("old.jpg")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter filenames"), { target: { value: "new" } });
    await waitFor(() => expect(requests).toBe(2));

    expect(screen.getByText("old.jpg")).toBeInTheDocument();
    expect(screen.queryByText("Opening folder…")).not.toBeInTheDocument();
    expect(document.querySelector(".gallery-scroll")).toHaveAttribute("aria-busy", "true");

    filtered.resolve(browseResponse("/media", 1, { media: [mediaEntry("/media/new.jpg")] }));
    expect(await screen.findByText("new.jpg")).toBeInTheDocument();
    expect(screen.queryByText("old.jpg")).not.toBeInTheDocument();
  });

  it("clears a transient same-folder request error after the next successful response", async () => {
    const failedRequest = deferred<BrowseResponse>();
    let requests = 0;
    mocks.api.mockImplementation(() => {
      requests += 1;
      if (requests === 1) return Promise.resolve(browseResponse("/media", 1, { media: [mediaEntry("/media/old.jpg")] }));
      if (requests === 2) return failedRequest.promise;
      return Promise.resolve(browseResponse("/media", 1, { media: [mediaEntry("/media/recovered.jpg")] }));
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    expect(await screen.findByText("old.jpg")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter filenames"), { target: { value: "broken" } });
    await waitFor(() => expect(requests).toBe(2));

    await act(async () => failedRequest.reject(new Error("Temporary browse failure.")));
    expect(await screen.findByText("Temporary browse failure.")).toBeInTheDocument();
    expect(screen.getByText("old.jpg")).toBeInTheDocument();
    expect(screen.queryByText("Opening folder…")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter filenames"), { target: { value: "recovered" } });
    expect(await screen.findByText("recovered.jpg")).toBeInTheDocument();
    expect(screen.queryByText("Temporary browse failure.")).not.toBeInTheDocument();
    expect(screen.queryByText("Opening folder…")).not.toBeInTheDocument();
  });

  it("does not show the opening placeholder when revalidating a folder-only response", async () => {
    const revalidated = deferred<BrowseResponse>();
    let requests = 0;
    const folders = [{ path: "/media/photos", name: "photos", displayName: "Photos", hidden: false, favorite: false }];
    mocks.api.mockImplementation(() => {
      requests += 1;
      return requests === 1 ? Promise.resolve(browseResponse("/media", 0, { folders })) : revalidated.promise;
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /Photos/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter filenames"), { target: { value: "photo" } });
    await waitFor(() => expect(requests).toBe(2));

    expect(screen.getByRole("button", { name: /Photos/ })).toBeInTheDocument();
    expect(screen.queryByText("Opening folder…")).not.toBeInTheDocument();
    revalidated.resolve(browseResponse("/media", 0, { folders }));
  });

  it("keeps media visible and clears stale classifications while the active list changes", async () => {
    const revalidated = deferred<BrowseResponse>();
    const firstList = list(7, "Keepers");
    const secondList = list(8, "Review");
    mocks.activeList = firstList;
    let requests = 0;
    mocks.api.mockImplementation(() => {
      requests += 1;
      return requests === 1
        ? Promise.resolve(browseResponse("/media", 1, { media: [{ ...mediaEntry("/media/photo.jpg"), status: "selected" }] }))
        : revalidated.promise;
    });

    const { rerender } = render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    expect(await screen.findByText("photo.jpg")).toBeInTheDocument();
    expect(screen.getByText("photo.jpg").closest(".media-tile")).toHaveClass("state-selected");

    mocks.activeList = secondList;
    rerender(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    await waitFor(() => expect(requests).toBe(2));
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    expect(screen.getByText("photo.jpg").closest(".media-tile")).toHaveClass("state-none");
    expect(screen.queryByText("Opening folder…")).not.toBeInTheDocument();

    revalidated.resolve(browseResponse("/media", 1, { media: [{ ...mediaEntry("/media/photo.jpg"), status: "maybe" }] }));
    await waitFor(() => expect(screen.getByText("photo.jpg").closest(".media-tile")).toHaveClass("state-maybe"));
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

  it("prefetches from the last loaded item and queues one advance without duplicate requests", async () => {
    const secondPage = deferred<BrowseResponse>();
    mocks.api.mockImplementation((url: string) => {
      const offset = Number(new URL(url, "http://these.test").searchParams.get("offset"));
      if (offset === 0) {
        return Promise.resolve(browseResponse("/media", 3, {
          limit: 1,
          hasMore: true,
          media: [mediaEntry("/media/first.jpg")],
        }));
      }
      if (offset === 1) return secondPage.promise;
      return Promise.resolve(browseResponse("/media", 3, {
        offset: 2,
        limit: 1,
        media: [mediaEntry("/media/third.jpg")],
      }));
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Open first.jpg" }));
    await waitFor(() => expect(requestsAtOffset(1)).toHaveLength(1));

    const firstViewer = screen.getByRole("dialog", { name: "first.jpg" });
    fireEvent.click(within(firstViewer).getByRole("button", { name: "Next" }));
    expect(within(firstViewer).getByRole("button", { name: "Next" })).toBeDisabled();
    expect(requestsAtOffset(1)).toHaveLength(1);

    secondPage.resolve(browseResponse("/media", 3, {
      offset: 1,
      limit: 1,
      hasMore: true,
      media: [mediaEntry("/media/second.jpg")],
    }));
    expect(await screen.findByRole("dialog", { name: "second.jpg" })).toBeInTheDocument();
    await waitFor(() => expect(requestsAtOffset(2)).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByRole("dialog", { name: "third.jpg" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows only the active list name in a viewer chip", async () => {
    mocks.activeList = list(7, "Keepers");
    mocks.api.mockResolvedValue(browseResponse("/media", 1, { media: [mediaEntry("/media/first.jpg")] }));

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Open first.jpg" }));

    const viewer = screen.getByRole("dialog", { name: "first.jpg" });
    expect(within(viewer).getByText("Keepers", { selector: ".viewer-context-chip" })).toBeInTheDocument();
    expect(within(viewer).queryByText("Active: Keepers")).not.toBeInTheDocument();
  });

  it("omits the viewer context when there is no active list", async () => {
    mocks.api.mockResolvedValue(browseResponse("/media", 1, { media: [mediaEntry("/media/first.jpg")] }));

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Open first.jpg" }));

    const viewer = screen.getByRole("dialog", { name: "first.jpg" });
    expect(within(viewer).queryByText("Classification unavailable")).not.toBeInTheDocument();
    expect(viewer.querySelector(".viewer-context-chip")).not.toBeInTheDocument();
  });

  it("continues prefetching when a page has no available media", async () => {
    mocks.api.mockImplementation(async (url: string) => {
      const offset = Number(new URL(url, "http://these.test").searchParams.get("offset"));
      if (offset === 0) {
        return browseResponse("/media", 3, {
          limit: 1,
          hasMore: true,
          media: [mediaEntry("/media/first.jpg")],
        });
      }
      if (offset === 1) return browseResponse("/media", 3, { offset: 1, limit: 1, hasMore: true });
      return browseResponse("/media", 3, {
        offset: 2,
        limit: 1,
        media: [mediaEntry("/media/third.jpg")],
      });
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Open first.jpg" }));

    await waitFor(() => expect(requestsAtOffset(2)).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "third.jpg" })).toBeInTheDocument();
  });

  it("keeps the current item after a failed prefetch and retries from Next", async () => {
    let pageAttempts = 0;
    mocks.api.mockImplementation((url: string) => {
      const offset = Number(new URL(url, "http://these.test").searchParams.get("offset"));
      if (offset === 0) {
        return Promise.resolve(browseResponse("/media", 2, {
          limit: 1,
          hasMore: true,
          media: [mediaEntry("/media/first.jpg")],
        }));
      }
      pageAttempts += 1;
      if (pageAttempts === 1) return Promise.reject(new Error("Could not prefetch media."));
      return Promise.resolve(browseResponse("/media", 2, {
        offset: 1,
        limit: 1,
        media: [mediaEntry("/media/second.jpg")],
      }));
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Open first.jpg" }));
    expect(await screen.findByText("Could not prefetch media.")).toBeInTheDocument();

    const viewer = screen.getByRole("dialog", { name: "first.jpg" });
    const next = within(viewer).getByRole("button", { name: "Next" });
    expect(next).toBeEnabled();
    fireEvent.click(next);

    expect(await screen.findByRole("dialog", { name: "second.jpg" })).toBeInTheDocument();
    expect(pageAttempts).toBe(2);
  });

  it("waits for a same-folder revalidation before loading the next viewer page", async () => {
    const stalePage = deferred<BrowseResponse>();
    const revalidated = deferred<BrowseResponse>();
    let baseRequests = 0;
    let pageRequests = 0;
    mocks.activeList = list(7, "Keepers");
    mocks.setItemStatus.mockRejectedValue(new Error("Could not classify the file."));
    mocks.api.mockImplementation((url: string) => {
      const offset = Number(new URL(url, "http://these.test").searchParams.get("offset"));
      if (offset === 0) {
        baseRequests += 1;
        if (baseRequests === 1) {
          return Promise.resolve(browseResponse("/media", 2, {
            limit: 1,
            hasMore: true,
            media: [mediaEntry("/media/first.jpg")],
          }));
        }
        return revalidated.promise;
      }
      pageRequests += 1;
      if (pageRequests === 1) return stalePage.promise;
      return Promise.resolve(browseResponse("/media", 2, {
        offset: 1,
        limit: 1,
        media: [mediaEntry("/media/second.jpg")],
      }));
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Open first.jpg" }));
    await waitFor(() => expect(pageRequests).toBe(1));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Selected/ }));
    expect(await screen.findByText("Could not classify the file.")).toBeInTheDocument();
    await waitFor(() => expect(baseRequests).toBe(2));

    stalePage.resolve(browseResponse("/media", 2, {
      offset: 1,
      limit: 1,
      media: [mediaEntry("/media/second.jpg")],
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(pageRequests).toBe(1);

    revalidated.resolve(browseResponse("/media", 2, {
      limit: 1,
      hasMore: true,
      media: [mediaEntry("/media/first.jpg")],
    }));
    expect(await screen.findByRole("dialog", { name: "second.jpg" })).toBeInTheDocument();
    expect(pageRequests).toBe(2);
  });

  it("does not apply a queued advance to a viewer reopened while the next page is loading", async () => {
    const secondPage = deferred<BrowseResponse>();
    mocks.api.mockImplementation((url: string) => {
      const offset = Number(new URL(url, "http://these.test").searchParams.get("offset"));
      return offset === 0
        ? Promise.resolve(browseResponse("/media", 2, { limit: 1, hasMore: true, media: [mediaEntry("/media/first.jpg")] }))
        : secondPage.promise;
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Open first.jpg" }));
    await waitFor(() => expect(requestsAtOffset(1)).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Open first.jpg" }));

    secondPage.resolve(browseResponse("/media", 2, {
      offset: 1,
      limit: 1,
      media: [mediaEntry("/media/second.jpg")],
    }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "first.jpg" })).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "second.jpg" })).not.toBeInTheDocument();
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

  it("updates a favorite optimistically and restores it without flashing when the request fails", async () => {
    const update = deferred<unknown>();
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/folder-metadata" && init?.method === "POST") return update.promise;
      return Promise.resolve(browseResponse("/media/photos", 1, { media: [mediaEntry("/media/photos/photo.jpg")] }));
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia%2Fphotos"]}><BrowsePage /></MemoryRouter>);
    expect(await screen.findByText("photo.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add current folder to favorites" }));

    const optimisticButton = screen.getByRole("button", { name: "Remove current folder from favorites" });
    expect(optimisticButton).toBeDisabled();
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    expect(screen.queryByText("Opening folder…")).not.toBeInTheDocument();

    update.reject(new Error("Could not save the favorite."));
    expect(await screen.findByText("Could not save the favorite.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add current folder to favorites" })).not.toBeDisabled();
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
  });

  it("hides a folder from the left sidebar optimistically and restores it on failure", async () => {
    const update = deferred<unknown>();
    const photos = { path: "/media/photos", name: "photos", displayName: "Photos", hidden: false, favorite: false };
    mocks.preferences.leftSidebarOpen = true;
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/folder-metadata" && init?.method === "POST") return update.promise;
      return Promise.resolve(browseResponse("/media", 0, { folders: [photos] }));
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    const sidebar = screen.getByRole("complementary", { name: "Folders" });
    fireEvent.click(within(sidebar).getByRole("button", { name: "Expand Library" }));
    expect(await within(sidebar).findByTitle("/media/photos")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide folder" }));
    expect(within(sidebar).queryByTitle("/media/photos")).not.toBeInTheDocument();

    await act(async () => update.reject(new Error("Could not hide the folder.")));
    expect(await screen.findByText("Could not hide the folder.")).toBeInTheDocument();
    expect(await within(sidebar).findByTitle("/media/photos")).toBeInTheDocument();
  });

  it("does not restore a failed folder mutation after navigating elsewhere", async () => {
    const update = deferred<unknown>();
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/folder-metadata" && init?.method === "POST") return update.promise;
      const folderPath = new URL(url, "http://these.test").searchParams.get("path")!;
      return Promise.resolve(browseResponse(folderPath, 1, { media: [mediaEntry(`${folderPath}/${folderPath.endsWith("new") ? "new" : "old"}.jpg`)] }));
    });

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia%2Fold"]}><NavigationHarness /></MemoryRouter>);
    expect(await screen.findByText("old.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add current folder to favorites" }));
    fireEvent.click(screen.getByRole("button", { name: "Open new folder" }));
    expect(await screen.findByText("new.jpg")).toBeInTheDocument();

    await act(async () => update.reject(new Error("Could not save the favorite.")));
    expect(await screen.findByText("Could not save the favorite.")).toBeInTheDocument();
    expect(screen.getByText("new.jpg")).toBeInTheDocument();
    expect(screen.queryByTitle("/media/old")).not.toBeInTheDocument();
  });

  it("rolls back a failed optimistic classification without replacing the gallery", async () => {
    const update = deferred<void>();
    mocks.activeList = list(7, "Keepers");
    mocks.setItemStatus.mockReturnValue(update.promise);
    mocks.api.mockResolvedValue(browseResponse("/media", 1, { media: [mediaEntry("/media/photo.jpg")] }));

    render(<MemoryRouter initialEntries={["/browse?path=%2Fmedia"]}><BrowsePage /></MemoryRouter>);
    expect(await screen.findByText("photo.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark selected" }));

    expect(screen.getByText("photo.jpg").closest(".media-tile")).toHaveClass("state-selected");
    expect(screen.getByRole("button", { name: "Mark selected" })).toBeDisabled();
    expect(screen.queryByText("Opening folder…")).not.toBeInTheDocument();

    update.reject(new Error("Could not classify the file."));
    expect(await screen.findByText("Could not classify the file.")).toBeInTheDocument();
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Could not classify the file.")).toBeInTheDocument();
    expect(screen.getByText("photo.jpg").closest(".media-tile")).toHaveClass("state-none");
    expect(screen.getByRole("button", { name: "Mark selected" })).not.toBeDisabled();
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

function mediaEntry(path: string): BrowseResponse["media"][number] {
  return {
    path,
    name: path.split("/").pop()!,
    kind: "image",
    size: 1,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    status: null,
  };
}

function list(id: number, name: string): TheseList {
  return { id, name, selectedCount: 0, maybeCount: 0, createdAt: "", updatedAt: "" };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function requestsAtOffset(offset: number) {
  return mocks.api.mock.calls.filter(([url]) => Number(new URL(url as string, "http://these.test").searchParams.get("offset")) === offset);
}
