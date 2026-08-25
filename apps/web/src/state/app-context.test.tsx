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
});

function CreateListHarness() {
  const { activeList, createList } = useApp();
  return <><span>Active: {activeList?.name ?? "None"}</span><button type="button" onClick={() => void createList("Archive")}>Create Archive</button></>;
}
