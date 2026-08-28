import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionsPage } from "./CollectionsPage";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

describe("CollectionsPage", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/collections" && init?.method === "POST") return Promise.resolve({ id: 9, name: "Dogs", folderCount: 0, createdAt: "", updatedAt: "" });
      return Promise.resolve([{ id: 4, name: "Animals", folderCount: 3, createdAt: "", updatedAt: "" }]);
    });
  });

  it("shows folder counts and creates a collection with the established dialog", async () => {
    render(<MemoryRouter><CollectionsPage /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Open Animals" })).toHaveAttribute("href", "/collections/4");
    expect(screen.getByText("3 folders")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New collection" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Collection name" }), { target: { value: "Dogs" } });
    fireEvent.click(screen.getByRole("button", { name: "Create collection" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/collections", expect.objectContaining({ body: JSON.stringify({ name: "Dogs" }) })));
  });

  it("searches, filters, sorts, and clears collection results locally", async () => {
    mocks.api.mockResolvedValue([
      { id: 1, name: "Zoo", folderCount: 2, createdAt: "", updatedAt: "" },
      { id: 2, name: "Archive", folderCount: 0, createdAt: "", updatedAt: "" },
      { id: 3, name: "Birds", folderCount: 8, createdAt: "", updatedAt: "" },
    ]);
    render(<MemoryRouter><CollectionsPage /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Open Archive" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search collections"), { target: { value: "zoo" } });
    expect(screen.getByText("Zoo")).toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear collection search" }));
    fireEvent.click(screen.getByRole("button", { name: "Empty" }));
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.queryByText("Birds")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Sort collections"), { target: { value: "most-folders" } });
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByText(/Birds|Zoo|Archive/).map((node) => node.textContent)).toEqual(["Birds", "Zoo", "Archive"]);

    fireEvent.change(screen.getByLabelText("Search collections"), { target: { value: "missing" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear results" }));
    expect(screen.getByText("Archive")).toBeInTheDocument();
  });
});
