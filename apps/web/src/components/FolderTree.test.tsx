import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { BrowseResponse } from "@these/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FolderTree } from "./FolderTree";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
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
    preferences: { showHidden: mocks.showHidden },
  }),
}));

describe("FolderTree", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.showHidden = false;
    mocks.favorites = [];
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

    expect((await screen.findByText("Hidden child")).closest(".tree-row")).toHaveClass("is-hidden");
    expect(screen.getByRole("button", { name: "Hidden favorite" })).toHaveClass("is-hidden");
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
