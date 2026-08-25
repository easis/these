import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapResponse, TheseList } from "@these/shared";
import { AppProvider, useApp } from "./app-context";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../lib/preferences", () => ({
  applyTheme: vi.fn(),
  readPreferences: () => ({
    theme: "light",
    thumbnailSize: 180,
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    showHidden: false,
    lastFolder: null,
  }),
  writePreferences: vi.fn(),
}));

const existingList: TheseList = { id: 1, name: "Existing", selectedCount: 0, maybeCount: 0, createdAt: "", updatedAt: "" };
const createdList: TheseList = { id: 2, name: "Archive", selectedCount: 0, maybeCount: 0, createdAt: "", updatedAt: "" };
const bootstrap: BootstrapResponse = { roots: [], lists: [existingList, createdList], activeListId: 1, favorites: [] };

describe("AppProvider list creation", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.api.mockImplementation(async (url: string) => {
      if (url === "/api/bootstrap") return bootstrap;
      if (url === "/api/lists") return createdList;
      return undefined;
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });

  it("creates a list without changing the active list", async () => {
    render(<AppProvider><CreateListHarness /></AppProvider>);
    expect(await screen.findByText("Active: Existing")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Archive" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/lists", {
      method: "POST",
      body: JSON.stringify({ name: "Archive" }),
    }));
    expect(mocks.api.mock.calls.some(([url]) => url === "/api/settings/active-list")).toBe(false);
    expect(screen.getByText("Active: Existing")).toBeInTheDocument();
  });

  it("changes the active list optimistically and reconciles after success", async () => {
    const update = deferred<void>();
    let activeListId = 1;
    mocks.api.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/bootstrap") return { ...bootstrap, activeListId };
      if (url === "/api/settings/active-list" && init?.method === "PUT") {
        await update.promise;
        activeListId = 2;
        return { activeListId };
      }
      return undefined;
    });
    render(<AppProvider><ActiveListHarness /></AppProvider>);
    expect(await screen.findByText("Active: Existing")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Activate Archive" }));
    expect(screen.getByText("Active: Archive")).toBeInTheDocument();

    update.resolve();
    await waitFor(() => expect(mocks.api.mock.calls.filter(([url]) => url === "/api/bootstrap")).toHaveLength(2));
    expect(screen.getByText("Active: Archive")).toBeInTheDocument();
  });

  it("restores the previous active list when the update fails", async () => {
    const update = deferred<void>();
    mocks.api.mockImplementation(async (url: string) => {
      if (url === "/api/bootstrap") return bootstrap;
      if (url === "/api/settings/active-list") return update.promise;
      return undefined;
    });
    render(<AppProvider><ActiveListHarness /></AppProvider>);
    expect(await screen.findByText("Active: Existing")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Activate Archive" }));
    expect(screen.getByText("Active: Archive")).toBeInTheDocument();
    update.reject(new Error("Write failed."));

    expect(await screen.findByText("Active: Existing")).toBeInTheDocument();
  });

  it("refreshes bootstrap when the browser reports that it is online again", async () => {
    render(<AppProvider><ActiveListHarness /></AppProvider>);
    expect(await screen.findByText("Active: Existing")).toBeInTheDocument();
    expect(mocks.api.mock.calls.filter(([url]) => url === "/api/bootstrap")).toHaveLength(1);

    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(mocks.api.mock.calls.filter(([url]) => url === "/api/bootstrap")).toHaveLength(2));
  });
});

function CreateListHarness() {
  const { activeList, createList } = useApp();
  return <><span>Active: {activeList?.name ?? "None"}</span><button type="button" onClick={() => void createList("Archive")}>Create Archive</button></>;
}

function ActiveListHarness() {
  const { activeList, setActiveList } = useApp();
  return <><span>Active: {activeList?.name ?? "None"}</span><button type="button" onClick={() => void setActiveList(2).catch(() => undefined)}>Activate Archive</button></>;
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
