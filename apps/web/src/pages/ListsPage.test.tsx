import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListsPage } from "./ListsPage";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  createList: vi.fn(),
  setActiveList: vi.fn(),
}));

vi.mock("../state/app-context", () => ({
  useApp: () => ({
    bootstrap: {
      lists: [
        { id: 7, name: "Large archive", selectedCount: 1240, maybeCount: 12, createdAt: "", updatedAt: "" },
        { id: 8, name: "Empty list", selectedCount: 0, maybeCount: 0, createdAt: "", updatedAt: "" },
      ],
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
});
