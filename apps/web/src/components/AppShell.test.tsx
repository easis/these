import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

const mocks = vi.hoisted(() => ({
  setPreferences: vi.fn(),
  refresh: vi.fn(),
  useApp: vi.fn(),
}));

vi.mock("../state/app-context", () => ({
  useApp: () => mocks.useApp(),
}));

describe("AppShell theme switcher", () => {
  beforeEach(() => {
    mocks.setPreferences.mockClear();
    mocks.refresh.mockReset();
    mocks.refresh.mockResolvedValue(undefined);
    mocks.useApp.mockReturnValue({
      bootstrap: { roots: [], lists: [], activeListId: null, favorites: [] },
      error: null,
      loading: false,
      preferences: { theme: "system" },
      refresh: mocks.refresh,
      setPreferences: mocks.setPreferences,
    });
  });

  it("replaces the Local indicator with an accessible theme selector", () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);

    expect(screen.queryByText("Local")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System theme" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(mocks.setPreferences).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("exposes labeled desktop and mobile navigation with the current section active", () => {
    render(<MemoryRouter initialEntries={["/lists/12"]}><AppShell /></MemoryRouter>);

    const desktopNavigation = screen.getByRole("navigation", { name: "Main navigation" });
    const mobileNavigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(desktopNavigation).getAllByRole("link")).toHaveLength(4);
    expect(within(mobileNavigation).getAllByRole("link")).toHaveLength(4);
    expect(within(mobileNavigation).getByRole("link", { name: "Lists" })).toHaveClass("is-active");
    expect(within(mobileNavigation).getByRole("link", { name: "Browse" })).not.toHaveClass("is-active");
  });

  it("shows a retryable server-unavailable state instead of route content", () => {
    mocks.useApp.mockReturnValue({
      bootstrap: null,
      error: "Failed to fetch",
      loading: false,
      preferences: { theme: "system" },
      refresh: mocks.refresh,
      setPreferences: mocks.setPreferences,
    });

    render(<MemoryRouter><AppShell /></MemoryRouter>);

    expect(screen.getByRole("alert")).toHaveTextContent("Server unavailable");
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
