import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListSidebar } from "./ListSidebar";

const mocks = vi.hoisted(() => ({
  setActiveList: vi.fn(),
  createList: vi.fn(),
  leftSidebarOpen: true,
  rightSidebarWidth: 208,
  setPreferences: vi.fn(),
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
    preferences: { leftSidebarOpen: mocks.leftSidebarOpen, rightSidebarWidth: mocks.rightSidebarWidth },
    setActiveList: mocks.setActiveList,
    createList: mocks.createList,
    setPreferences: mocks.setPreferences,
  }),
}));

describe("ListSidebar", () => {
  beforeEach(() => {
    mocks.setActiveList.mockReset();
    mocks.setActiveList.mockResolvedValue(undefined);
    mocks.createList.mockReset();
    mocks.createList.mockResolvedValue(undefined);
    mocks.leftSidebarOpen = true;
    mocks.rightSidebarWidth = 208;
    mocks.setPreferences.mockReset();
    vi.stubGlobal("innerWidth", 1280);
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
    expect(screen.getByRole("dialog", { name: "Create list" })).toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Create list" });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "List name" }), { target: { value: "Archive" } });
    fireEvent.click(create);
    await waitFor(() => expect(mocks.createList).toHaveBeenCalledWith("Archive"));

    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Create list" })).not.toBeInTheDocument();
  });

  it("blocks duplicate creation submissions while the request is pending", async () => {
    let resolveCreation!: () => void;
    mocks.createList.mockReturnValue(new Promise<void>((resolve) => { resolveCreation = resolve; }));
    render(<MemoryRouter><ListSidebar /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "New list" }));
    const input = screen.getByRole("textbox", { name: "List name" });
    const create = screen.getByRole("button", { name: "Create list" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const form = input.closest("form")!;
    fireEvent.change(input, { target: { value: "Archive" } });
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(mocks.createList).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Create list" })).toHaveAttribute("aria-busy", "true");
    expect(input).toBeDisabled();
    expect(create).toBeDisabled();
    expect(cancel).toBeDisabled();

    resolveCreation();
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "List name" })).not.toBeInTheDocument());
  });

  it("exposes an accessible desktop separator and resizes inward with the keyboard", () => {
    render(<MemoryRouter><ListSidebar /></MemoryRouter>);

    const sidebar = screen.getByRole("complementary", { name: "Lists" });
    const resize = screen.getByRole("separator", { name: "Resize list sidebar" });
    expect(sidebar.style.getPropertyValue("--sidebar-width")).toBe("208px");
    expect(resize).toHaveAttribute("aria-valuemin", "180");
    expect(resize).toHaveAttribute("aria-valuemax", "400");
    expect(resize).toHaveAttribute("aria-valuenow", "208");

    fireEvent.keyDown(resize, { key: "ArrowLeft" });
    expect(mocks.setPreferences).toHaveBeenLastCalledWith({ rightSidebarWidth: 224 });
    expect(resize).toHaveAttribute("aria-valuenow", "224");

    fireEvent.keyDown(resize, { key: "ArrowRight" });
    expect(mocks.setPreferences).toHaveBeenLastCalledWith({ rightSidebarWidth: 208 });

    fireEvent.keyDown(resize, { key: "Home" });
    expect(mocks.setPreferences).toHaveBeenLastCalledWith({ rightSidebarWidth: 180 });

    fireEvent.keyDown(resize, { key: "End" });
    expect(mocks.setPreferences).toHaveBeenLastCalledWith({ rightSidebarWidth: 400 });
  });

  it("resizes with the pointer, persists on release and restores on cancellation", () => {
    render(<MemoryRouter><ListSidebar /></MemoryRouter>);
    const resize = screen.getByRole("separator", { name: "Resize list sidebar" });

    fireEvent(resize, pointerEvent("pointerdown", { button: 0, pointerId: 4, clientX: 208 }));
    fireEvent(resize, pointerEvent("pointermove", { pointerId: 4, clientX: 160 }));
    expect(mocks.setPreferences).not.toHaveBeenCalled();
    expect(resize).toHaveAttribute("aria-valuenow", "256");

    fireEvent(resize, pointerEvent("pointerup", { pointerId: 4, clientX: 160 }));
    expect(mocks.setPreferences).toHaveBeenCalledOnce();
    expect(mocks.setPreferences).toHaveBeenCalledWith({ rightSidebarWidth: 256 });

    mocks.setPreferences.mockReset();
    fireEvent(resize, pointerEvent("pointerdown", { button: 0, pointerId: 5, clientX: 160 }));
    fireEvent(resize, pointerEvent("pointermove", { pointerId: 5, clientX: 120 }));
    fireEvent(resize, pointerEvent("pointercancel", { pointerId: 5, clientX: 120 }));
    expect(resize).toHaveAttribute("aria-valuenow", "256");
    expect(mocks.setPreferences).not.toHaveBeenCalled();
  });

  it("caps a saved width to the desktop viewport and omits the separator in the compact modal", () => {
    mocks.rightSidebarWidth = 480;
    vi.stubGlobal("innerWidth", 800);
    const { unmount } = render(<MemoryRouter><ListSidebar /></MemoryRouter>);

    const sidebar = screen.getByRole("complementary", { name: "Lists" });
    const resize = screen.getByRole("separator", { name: "Resize list sidebar" });
    expect(sidebar.style.getPropertyValue("--sidebar-width")).toBe("336px");
    expect(resize).toHaveAttribute("aria-valuemax", "336");
    expect(resize).toHaveAttribute("aria-valuenow", "336");

    unmount();
    render(<MemoryRouter><ListSidebar modal /></MemoryRouter>);
    expect(screen.queryByRole("separator", { name: "Resize list sidebar" })).not.toBeInTheDocument();
  });

  it("reserves space for the gallery when both desktop sidebars are open", () => {
    mocks.rightSidebarWidth = 480;
    vi.stubGlobal("innerWidth", 981);
    const { unmount } = render(<MemoryRouter><ListSidebar /></MemoryRouter>);

    const sidebar = screen.getByRole("complementary", { name: "Lists" });
    const resize = screen.getByRole("separator", { name: "Resize list sidebar" });
    expect(sidebar.style.getPropertyValue("--sidebar-width")).toBe("250px");
    expect(resize).toHaveAttribute("aria-valuemax", "250");

    unmount();
    mocks.leftSidebarOpen = false;
    render(<MemoryRouter><ListSidebar /></MemoryRouter>);
    expect(screen.getByRole("complementary", { name: "Lists" }).style.getPropertyValue("--sidebar-width")).toBe("412px");
    expect(screen.getByRole("separator", { name: "Resize list sidebar" })).toHaveAttribute("aria-valuemax", "412");
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

function pointerEvent(type: string, values: { button?: number; pointerId: number; clientX: number }) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    button: { value: values.button ?? 0 },
    pointerId: { value: values.pointerId },
    clientX: { value: values.clientX },
  });
  return event;
}
