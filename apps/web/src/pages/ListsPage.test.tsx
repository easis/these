import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListsPage } from "./ListsPage";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  createList: vi.fn(),
  setActiveList: vi.fn(),
  lists: [
    { id: 7, name: "Large archive", selectedCount: 1240, maybeCount: 12, discardedCount: 3, createdAt: "", updatedAt: "" },
    { id: 8, name: "Empty list", selectedCount: 0, maybeCount: 0, discardedCount: 0, createdAt: "", updatedAt: "" },
  ],
}));

vi.mock("../state/app-context", () => ({
  useApp: () => ({
    bootstrap: {
      lists: mocks.lists,
    },
    activeList: null,
    createList: mocks.createList,
    setActiveList: mocks.setActiveList,
  }),
}));

describe("ListsPage", () => {
  beforeEach(() => {
    mocks.confirm.mockReset();
    mocks.confirm.mockReturnValue(false);
    mocks.createList.mockReset();
    mocks.createList.mockResolvedValue(undefined);
    mocks.lists = [
      { id: 7, name: "Large archive", selectedCount: 1240, maybeCount: 12, discardedCount: 3, createdAt: "", updatedAt: "" },
      { id: 8, name: "Empty list", selectedCount: 0, maybeCount: 0, discardedCount: 0, createdAt: "", updatedAt: "" },
    ];
    vi.stubGlobal("confirm", mocks.confirm);
  });

  it("creates a list from a focused dialog", async () => {
    render(<MemoryRouter><ListsPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    expect(screen.getByRole("dialog", { name: "Create list" })).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "List name" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "Archive" } });
    fireEvent.click(screen.getByRole("button", { name: "Create list" }));

    await waitFor(() => expect(mocks.createList).toHaveBeenCalledWith("Archive"));
    expect(screen.queryByRole("dialog", { name: "Create list" })).not.toBeInTheDocument();
  });

  it("explains the cost and file count before starting a list download", () => {
    render(<MemoryRouter><ListsPage /></MemoryRouter>);

    const download = screen.getByRole("button", { name: "Download selected from Large archive" });
    fireEvent.click(download);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("Download 1,240 selected files from “Large archive”?"));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("significant server resources"));
    expect(screen.getByRole("button", { name: "Download selected from Empty list" })).toBeDisabled();
  });

  it("searches, filters, sorts, and clears list results locally", () => {
    mocks.lists = [
      { id: 1, name: "Zoo", selectedCount: 2, maybeCount: 0, discardedCount: 0, createdAt: "", updatedAt: "" },
      { id: 2, name: "Archive", selectedCount: 0, maybeCount: 0, discardedCount: 0, createdAt: "", updatedAt: "" },
      { id: 3, name: "Birds", selectedCount: 4, maybeCount: 3, discardedCount: 1, createdAt: "", updatedAt: "" },
    ];
    render(<MemoryRouter><ListsPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText("Search lists"), { target: { value: "zoo" } });
    expect(screen.getByText("Zoo")).toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear list search" }));
    fireEvent.click(screen.getByRole("button", { name: "Empty" }));
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.queryByText("Birds")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Sort lists"), { target: { value: "most-media" } });
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByText(/Birds|Zoo|Archive/).map((node) => node.textContent)).toEqual(["Birds", "Zoo", "Archive"]);

    fireEvent.change(screen.getByLabelText("Search lists"), { target: { value: "missing" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear results" }));
    expect(screen.getByText("Archive")).toBeInTheDocument();
  });
});
