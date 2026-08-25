import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

const mocks = vi.hoisted(() => ({
  setPreferences: vi.fn(),
}));

vi.mock("../state/app-context", () => ({
  useApp: () => ({
    preferences: { theme: "system" },
    setPreferences: mocks.setPreferences,
  }),
}));

describe("AppShell theme switcher", () => {
  beforeEach(() => mocks.setPreferences.mockClear());

  it("replaces the Local indicator with an accessible theme selector", () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);

    expect(screen.queryByText("Local")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System theme" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(mocks.setPreferences).toHaveBeenCalledWith({ theme: "dark" });
  });
});
