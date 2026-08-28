import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ListItem } from "@these/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListPage } from "./ListPage";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(async () => undefined),
  setActiveList: vi.fn(async () => undefined),
}));

vi.mock("../lib/api", async () => ({
  ...await vi.importActual<typeof import("../lib/api")>("../lib/api"),
  api: mocks.api,
}));

vi.mock("../state/app-context", () => ({
  useApp: () => ({
    bootstrap: {
      roots: [],
      lists: [
        { id: 7, name: "Reviewed delivery", selectedCount: 1, maybeCount: 1, discardedCount: 0, createdAt: "", updatedAt: "" },
        { id: 8, name: "Different active list", selectedCount: 0, maybeCount: 0, discardedCount: 0, createdAt: "", updatedAt: "" },
      ],
      activeListId: 8,
      favorites: [],
    },
    activeList: { id: 8, name: "Different active list", selectedCount: 0, maybeCount: 0, discardedCount: 0, createdAt: "", updatedAt: "" },
    refresh: mocks.refresh,
    setActiveList: mocks.setActiveList,
  }),
}));

describe("ListPage viewer", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.api.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!init && url === "/api/lists/7/items?limit=1000") return [reviewedItem, maybeItem, discardedItem];
      if (!init && url === "/api/lists/8/items?limit=1000") return [];
      return undefined;
    });
  });

  it("labels and classifies the reviewed list even when another list is active", async () => {
    render(
      <MemoryRouter initialEntries={["/lists/7"]}>
        <Routes><Route path="/lists/:id" element={<ListPage />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open reviewed.jpg" }));

    const viewer = screen.getByRole("dialog", { name: "reviewed.jpg" });
    expect(within(viewer).getByText("Reviewed delivery")).toBeInTheDocument();
    expect(within(viewer).queryByText(/Different active list/)).not.toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole("button", { name: "Mark maybe" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/lists/7/items", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ path: reviewedItem.path, kind: reviewedItem.kind, status: "maybe" }),
    })));
  });

  it("keeps the same media open when changing its status moves it between groups", async () => {
    mocks.api.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!init && url === "/api/lists/7/items?limit=1000") return [reviewedItem, secondSelectedItem, maybeItem];
      return undefined;
    });
    render(<MemoryRouter initialEntries={["/lists/7"]}><Routes><Route path="/lists/:id" element={<ListPage />} /></Routes></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Open reviewed.jpg" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "reviewed.jpg" })).getByRole("button", { name: "Mark maybe" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "reviewed.jpg" })).toBeInTheDocument());
  });

  it("loads later pages before deciding whether Discarded is empty", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index): ListItem => ({
      ...reviewedItem,
      id: 1000 + index,
      path: `/missing/${index}.jpg`,
      name: `${index}.jpg`,
      missing: true,
    }));
    mocks.api.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init) return undefined;
      if (url === "/api/lists/7/items?limit=1000") return firstPage;
      if (url === "/api/lists/7/items?limit=1000&offset=1000") return [discardedItem];
      return [];
    });
    render(<MemoryRouter initialEntries={["/lists/7"]}><Routes><Route path="/lists/:id" element={<ListPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByRole("button", { name: /Discarded/ })).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith("/api/lists/7/items?limit=1000&offset=1000");
  });

  it("rolls back only the item whose concurrent status update failed", async () => {
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: () => void;
    const firstUpdate = new Promise<never>((_resolve, reject) => { rejectFirst = reject; });
    const secondUpdate = new Promise<void>((resolve) => { resolveSecond = resolve; });
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (!init && url === "/api/lists/7/items?limit=1000") return Promise.resolve([reviewedItem, secondSelectedItem]);
      if (url === "/api/lists/7/items" && init?.body?.toString().includes(reviewedItem.path)) return firstUpdate;
      if (url === "/api/lists/7/items" && init?.body?.toString().includes(secondSelectedItem.path)) return secondUpdate;
      return Promise.resolve(undefined);
    });
    render(<MemoryRouter initialEntries={["/lists/7"]}><Routes><Route path="/lists/:id" element={<ListPage />} /></Routes></MemoryRouter>);
    const firstTile = (await screen.findByRole("button", { name: "Open reviewed.jpg" })).closest("article")!;
    fireEvent.click(within(firstTile).getByRole("button", { name: "Mark maybe" }));
    const secondTile = screen.getByRole("button", { name: "Open second.jpg" }).closest("article")!;
    fireEvent.click(within(secondTile).getByRole("button", { name: "Mark discarded" }));
    resolveSecond();
    rejectFirst(new Error("First update failed."));

    expect(await screen.findByText("1 selected · 0 maybe · 1 discarded")).toBeInTheDocument();
  });

  it("offers counted download variants and renames the list in a dialog", async () => {
    render(
      <MemoryRouter initialEntries={["/lists/7"]}>
        <Routes><Route path="/lists/:id" element={<ListPage />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Open reviewed.jpg" });

    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Download options" }));
    const menu = screen.getByRole("menu", { name: "Download options" });
    expect(within(menu).getByRole("menuitem", { name: "Download Selected (1)" })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: "Download Maybe (1)" })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: "Download All (Selected + Maybe) (2)" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Edit list name" }));
    expect(screen.getByRole("dialog", { name: "Rename list" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "List name" }), { target: { value: "Final delivery" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/lists/7", {
      method: "PATCH",
      body: JSON.stringify({ name: "Final delivery" }),
    }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("keeps Discarded recoverable in an initially collapsed section", async () => {
    render(<MemoryRouter initialEntries={["/lists/7"]}><Routes><Route path="/lists/:id" element={<ListPage />} /></Routes></MemoryRouter>);
    const toggle = await screen.findByRole("button", { name: /Discarded/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Open discarded.jpg" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const tile = screen.getByRole("button", { name: "Open discarded.jpg" }).closest("article")!;
    fireEvent.click(within(tile).getByRole("button", { name: "Mark selected" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/lists/7/items", expect.objectContaining({ body: expect.stringContaining('"status":"selected"') })));
  });

  it("removes a reviewed item through its active Selected button", async () => {
    render(
      <MemoryRouter initialEntries={["/lists/7"]}>
        <Routes><Route path="/lists/:id" element={<ListPage />} /></Routes>
      </MemoryRouter>,
    );
    const reviewedTile = (await screen.findByRole("button", { name: "Open reviewed.jpg" })).closest("article")!;
    expect(within(reviewedTile).queryByRole("button", { name: "Remove from active list" })).not.toBeInTheDocument();
    fireEvent.click(within(reviewedTile).getByRole("button", { name: "Remove selected status" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/lists/7/items?path=%2Fmedia%2Freviewed.jpg", { method: "DELETE" }));
    expect(screen.getByText("No selected media.")).toBeInTheDocument();
  });

  it("uses the shorter Active label and disables empty downloads", async () => {
    render(
      <MemoryRouter initialEntries={["/lists/8"]}>
        <Routes><Route path="/lists/:id" element={<ListPage />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByText("No selected media.");

    expect(screen.getByText("Active", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Active list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download options" })).toBeDisabled();
  });
});

const reviewedItem: ListItem = {
  id: 10,
  listId: 7,
  path: "/media/reviewed.jpg",
  name: "reviewed.jpg",
  kind: "image",
  status: "selected",
  missing: false,
  size: 1,
  modifiedAt: "2026-01-01T00:00:00.000Z",
};

const maybeItem: ListItem = {
  ...reviewedItem,
  id: 11,
  path: "/media/maybe.jpg",
  name: "maybe.jpg",
  status: "maybe",
};

const secondSelectedItem: ListItem = {
  ...reviewedItem,
  id: 13,
  path: "/media/second.jpg",
  name: "second.jpg",
};

const discardedItem: ListItem = {
  ...reviewedItem,
  id: 12,
  path: "/media/discarded.jpg",
  name: "discarded.jpg",
  status: "discarded",
};
