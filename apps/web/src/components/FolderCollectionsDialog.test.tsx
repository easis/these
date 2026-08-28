import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderCollection, FolderEntry } from "@these/shared";
import { FolderCollectionsDialog } from "./FolderCollectionsDialog";

const mocks = vi.hoisted(() => ({ api: vi.fn(), onClose: vi.fn() }));

vi.mock("../lib/api", async () => ({
  ...await vi.importActual<typeof import("../lib/api")>("../lib/api"),
  api: mocks.api,
}));

const folder: FolderEntry = { path: "/media/dogs", name: "dogs", displayName: "Dog datasets", hidden: false, favorite: false };
const dogs: FolderCollection = { id: 1, name: "Dogs", folderCount: 2, createdAt: "", updatedAt: "" };
const training: FolderCollection = { id: 2, name: "Training", folderCount: 4, createdAt: "", updatedAt: "" };

describe("FolderCollectionsDialog", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.onClose.mockReset();
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/collections" && init?.method === "POST") return Promise.resolve({ id: 3, name: "Archive", folderCount: 0, createdAt: "", updatedAt: "" });
      if (url === "/api/collections") return Promise.resolve([dogs, training]);
      if (url.startsWith("/api/folder-collections?") && !init?.method) return Promise.resolve({ collectionIds: [dogs.id] });
      if (url === "/api/folder-collections" && init?.method === "PUT") return Promise.resolve({ collectionIds: [] });
      throw new Error(`Unexpected API call: ${url}`);
    });
  });

  it("loads memberships in parallel, creates inline and saves the complete selection", async () => {
    render(<FolderCollectionsDialog folder={folder} onClose={mocks.onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Add to collections" });
    const dogsCheckbox = await within(dialog).findByRole("checkbox", { name: /Dogs/ });
    const trainingCheckbox = within(dialog).getByRole("checkbox", { name: /Training/ });
    expect(dogsCheckbox).toBeChecked();
    expect(trainingCheckbox).not.toBeChecked();

    fireEvent.click(trainingCheckbox);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "New collection name" }), { target: { value: "Archive" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    const archiveCheckbox = await within(dialog).findByRole("checkbox", { name: /Archive/ });
    expect(archiveCheckbox).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/folder-collections", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ path: folder.path, collectionIds: [dogs.id, training.id, 3] }),
    })));
    expect(mocks.onClose).toHaveBeenCalledOnce();
  });

  it("does not allow an empty overwrite when membership loading fails", async () => {
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/collections") return Promise.resolve([dogs, training]);
      if (url.startsWith("/api/folder-collections?") && !init?.method) return Promise.reject(new Error("Memberships unavailable"));
      if (url === "/api/folder-collections" && init?.method === "PUT") return Promise.resolve({ collectionIds: [] });
      throw new Error(`Unexpected API call: ${url}`);
    });

    render(<FolderCollectionsDialog folder={folder} onClose={mocks.onClose} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Memberships unavailable");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mocks.api).not.toHaveBeenCalledWith("/api/folder-collections", expect.objectContaining({ method: "PUT" }));
  });

  it("keeps inline collection creation in locale-aware server order", async () => {
    const zoo: FolderCollection = { id: 8, name: "Zoo", folderCount: 0, createdAt: "", updatedAt: "" };
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/collections" && init?.method === "POST") return Promise.resolve({ id: 9, name: "ábaco", folderCount: 0, createdAt: "", updatedAt: "" });
      if (url === "/api/collections") return Promise.resolve([zoo]);
      if (url.startsWith("/api/folder-collections?") && !init?.method) return Promise.resolve({ collectionIds: [] });
      throw new Error(`Unexpected API call: ${url}`);
    });

    render(<FolderCollectionsDialog folder={folder} onClose={mocks.onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Add to collections" });
    await within(dialog).findByRole("checkbox", { name: /Zoo/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "New collection name" }), { target: { value: "ábaco" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await within(dialog).findByRole("checkbox", { name: /ábaco/ });
    expect(within(dialog).getAllByRole("checkbox").map((checkbox) => checkbox.closest("label")?.querySelector("strong")?.textContent)).toEqual(["ábaco", "Zoo"]);
  });
});
