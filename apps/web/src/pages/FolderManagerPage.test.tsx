import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderMetadata } from "@these/shared";
import { FolderManagerPage } from "./FolderManagerPage";

const folder: FolderMetadata = { id: 4, path: "/media/original ", alias: "Original", favorite: false, hidden: false, status: "ok", createdAt: "", updatedAt: "" };
const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn(async () => undefined) }));

vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../state/app-context", () => ({ useApp: () => ({ refresh: mocks.refresh }) }));

describe("FolderManagerPage row editing", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.refresh.mockClear();
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/folder-metadata" && !init) return Promise.resolve([folder]);
      return Promise.resolve(folder);
    });
  });

  it("saves exact paths with Enter and restores both fields with Escape", async () => {
    render(<FolderManagerPage />);
    const pathInput = await screen.findByRole("textbox", { name: "Path for Original" });
    fireEvent.change(pathInput, { target: { value: "/media/repaired  " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    fireEvent.keyDown(pathInput, { key: "Enter" });
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/folder-metadata/4", {
      method: "PATCH",
      body: JSON.stringify({ alias: "Original", path: "/media/repaired  " }),
    }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    fireEvent.change(pathInput, { target: { value: "/media/temporary" } });
    fireEvent.keyDown(pathInput, { key: "Escape" });
    expect(pathInput).toHaveValue("/media/original ");
  });

  it("keeps an update error on the affected row", async () => {
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/folder-metadata" && !init) return Promise.resolve([folder]);
      return Promise.reject(new Error("Folder path is unavailable."));
    });
    render(<FolderManagerPage />);
    const alias = await screen.findByRole("textbox", { name: /Alias for \/media\/original/ });
    fireEvent.change(alias, { target: { value: "Broken" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Folder path is unavailable.");
  });

  it("preserves unsaved field drafts while updating a flag", async () => {
    let savedFolder = folder;
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/folder-metadata" && !init) return Promise.resolve([savedFolder]);
      if (url === "/api/folder-metadata/4" && init) {
        savedFolder = { ...savedFolder, favorite: true };
        return Promise.resolve(savedFolder);
      }
      return Promise.resolve(savedFolder);
    });
    render(<FolderManagerPage />);
    const alias = await screen.findByRole("textbox", { name: /Alias for \/media\/original/ });
    fireEvent.change(alias, { target: { value: "Unsaved draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark favorite" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/folder-metadata/4", expect.objectContaining({
      body: JSON.stringify({ favorite: true }),
    })));
    expect(alias).toHaveValue("Unsaved draft");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
