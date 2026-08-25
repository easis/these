import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListSidebar } from "./ListSidebar";

const mocks = vi.hoisted(() => ({
  setActiveList: vi.fn(),
  createList: vi.fn(),
}));

vi.mock("../state/app-context", () => ({
  useApp: () => ({
    bootstrap: {
      lists: [
        { id: 7, name: "Keepers", selectedCount: 12, maybeCount: 3, createdAt: "", updatedAt: "" },
        { id: 8, name: "Review", selectedCount: 1, maybeCount: 0, createdAt: "", updatedAt: "" },
      ],
    },
    activeList: { id: 7, name: "Keepers", selectedCount: 12, maybeCount: 3, createdAt: "", updatedAt: "" },
    setActiveList: mocks.setActiveList,
    createList: mocks.createList,
  }),
}));

describe("ListSidebar", () => {
  beforeEach(() => {
    mocks.setActiveList.mockReset();
    mocks.createList.mockReset();
    mocks.createList.mockResolvedValue(undefined);
  });

  it("activates from the whole row and keeps management as a separate link", () => {
    render(<MemoryRouter><ListSidebar /></MemoryRouter>);

    const activate = screen.getByRole("button", { name: "Make Review active" });
    expect(activate).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(activate);
    expect(mocks.setActiveList).toHaveBeenCalledWith(8);

    expect(screen.getByRole("link", { name: "Manage Review" })).toHaveAttribute("href", "/lists/8");
    const deactivate = screen.getByRole("button", { name: "Deactivate Keepers" });
    expect(deactivate).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(deactivate);
    expect(mocks.setActiveList).toHaveBeenCalledWith(null);
  });

  it("provides mouse controls for creating and cancelling a list", async () => {
    render(<MemoryRouter><ListSidebar /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "List name" }), { target: { value: "Archive" } });
    fireEvent.click(create);
    await waitFor(() => expect(mocks.createList).toHaveBeenCalledWith("Archive"));

    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel new list" }));
    expect(screen.queryByRole("textbox", { name: "List name" })).not.toBeInTheDocument();
  });

  it("blocks duplicate creation submissions while the request is pending", async () => {
    let resolveCreation!: () => void;
    mocks.createList.mockReturnValue(new Promise<void>((resolve) => { resolveCreation = resolve; }));
    render(<MemoryRouter><ListSidebar /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    const input = screen.getByRole("textbox", { name: "List name" });
    const create = screen.getByRole("button", { name: "Create" });
    const cancel = screen.getByRole("button", { name: "Cancel new list" });
    const form = input.closest("form")!;
    fireEvent.change(input, { target: { value: "Archive" } });
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(mocks.createList).toHaveBeenCalledTimes(1);
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(input).toBeDisabled();
    expect(create).toBeDisabled();
    expect(cancel).toBeDisabled();

    resolveCreation();
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "List name" })).not.toBeInTheDocument());
  });
});
