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
        { id: 7, name: "Reviewed delivery", selectedCount: 1, maybeCount: 1, createdAt: "", updatedAt: "" },
        { id: 8, name: "Different active list", selectedCount: 0, maybeCount: 0, createdAt: "", updatedAt: "" },
      ],
      activeListId: 8,
      favorites: [],
    },
    activeList: { id: 8, name: "Different active list", selectedCount: 0, maybeCount: 0, createdAt: "", updatedAt: "" },
    refresh: mocks.refresh,
    setActiveList: mocks.setActiveList,
  }),
}));

describe("ListPage viewer", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.api.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!init && url === "/api/lists/7/items?limit=1000") return [reviewedItem, maybeItem];
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
    expect(within(viewer).getByText("List: Reviewed delivery")).toBeInTheDocument();
    expect(within(viewer).queryByText(/Different active list/)).not.toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole("button", { name: /Maybe/ }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/lists/7/items", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ path: reviewedItem.path, kind: reviewedItem.kind, status: "maybe" }),
    })));
  });

  it("offers counted download variants and renames the list inline", async () => {
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
    fireEvent.change(screen.getByRole("textbox", { name: "List name" }), { target: { value: "Final delivery" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/lists/7", {
      method: "PATCH",
      body: JSON.stringify({ name: "Final delivery" }),
    }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("uses the shorter Active label and disables empty downloads", async () => {
    render(
      <MemoryRouter initialEntries={["/lists/8"]}>
        <Routes><Route path="/lists/:id" element={<ListPage />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByText("No selected media.");

    expect(screen.getByText("Active", { selector: ".active-badge" })).toBeInTheDocument();
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
