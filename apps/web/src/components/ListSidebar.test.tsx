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
    mocks.setActiveList.mockResolvedValue(undefined);
    mocks.createList.mockReset();
    mocks.createList.mockResolvedValue(undefined);
  });

  it("activates from the whole row and keeps management as a separate link", async () => {
    const onSelection = vi.fn();
    render(<MemoryRouter><ListSidebar onSelection={onSelection} /></MemoryRouter>);

    const activate = screen.getByRole("button", { name: "Make Review active" });
    expect(activate).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(activate);
    expect(mocks.setActiveList).toHaveBeenCalledWith(8);
    await waitFor(() => expect(onSelection).toHaveBeenCalledOnce());
    await waitFor(() => expect(activate).not.toBeDisabled());

    expect(screen.getByRole("link", { name: "Manage Review" })).toHaveAttribute("href", "/lists/8");
    const deactivate = screen.getByRole("button", { name: "Deactivate Keepers" });
    expect(deactivate).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(deactivate);
    expect(mocks.setActiveList).toHaveBeenCalledWith(null);
    await waitFor(() => expect(onSelection).toHaveBeenCalledTimes(2));
  });

  it("blocks activation while pending and reports failures", async () => {
    const activation = deferred<void>();
    const onSelection = vi.fn();
    mocks.setActiveList.mockReturnValueOnce(activation.promise);
    render(<MemoryRouter><ListSidebar onSelection={onSelection} /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Make Review active" }));
    expect(screen.getByRole("complementary", { name: "Lists" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Deactivate Keepers" })).toBeDisabled();

    activation.reject(new Error("Could not save the active list."));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the active list.");
    expect(screen.getByRole("button", { name: "Deactivate Keepers" })).not.toBeDisabled();
    expect(onSelection).not.toHaveBeenCalled();
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
