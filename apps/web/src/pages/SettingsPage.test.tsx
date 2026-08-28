import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";

const mocks = vi.hoisted(() => ({
  api: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  setPreferences: vi.fn(),
  roots: [] as Array<{ id: string; label: string; path: string; available: boolean }>,
}));

vi.mock("../lib/api", async () => ({
  ...await vi.importActual<typeof import("../lib/api")>("../lib/api"),
  api: mocks.api,
}));

vi.mock("../state/app-context", () => ({
  useApp: () => ({
    bootstrap: { roots: mocks.roots, lists: [], activeListId: null, favorites: [] },
    preferences: {
      theme: "light",
      thumbnailSize: 180,
      mobileGalleryDensity: "compact",
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      showHidden: false,
      lastFolder: "/old/root",
    },
    setPreferences: mocks.setPreferences,
    refresh: mocks.refresh,
  }),
}));

describe("SettingsPage media roots", () => {
  beforeEach(() => {
    mocks.api.mockClear();
    mocks.refresh.mockClear();
    mocks.setPreferences.mockClear();
    mocks.roots = [];
  });

  it("adds a media root through the application settings", async () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText("Media root label"), { target: { value: "Photos" } });
    fireEvent.change(screen.getByLabelText("Path in These"), { target: { value: "/media/photos" } });
    fireEvent.click(screen.getByRole("button", { name: "Add root" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/settings/media-roots", {
      method: "POST",
      body: JSON.stringify({ label: "Photos", path: "/media/photos" }),
    }));
    expect(mocks.setPreferences).toHaveBeenCalledWith({ lastFolder: null });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("edits an existing root by its stable route id", async () => {
    mocks.roots = [{ id: "root-id", label: "Photos", path: "/media/photos", available: true }];
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Photos" }));
    fireEvent.change(screen.getByLabelText("Path in These"), { target: { value: "/media/archive" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/settings/media-roots/root-id", {
      method: "PATCH",
      body: JSON.stringify({ label: "Photos", path: "/media/archive" }),
    }));
  });

  it("shows inline validation for a clearly relative application path", () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText("Path in These"), { target: { value: "media/photos" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Use an absolute application path");
    expect(screen.getByRole("button", { name: "Add root" })).toBeDisabled();
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
