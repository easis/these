import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderCollectionDetail } from "@these/shared";
import { CollectionPage } from "./CollectionPage";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async () => ({
  ...await vi.importActual<typeof import("../lib/api")>("../lib/api"),
  api: mocks.api,
}));
vi.mock("../state/app-context", () => ({ useApp: () => ({ preferences: { showHidden: false } }) }));

const detail: FolderCollectionDetail = {
  id: 7,
  name: "Dogs",
  folderCount: 2,
  createdAt: "",
  updatedAt: "",
  folders: [
    { path: "/media/beagles", name: "beagles", displayName: "Beagles", hidden: false, favorite: true, status: "ready" },
    { path: "/offline/huskies", name: "huskies", displayName: "Huskies", hidden: false, favorite: false, status: "root-unavailable" },
  ],
};

describe("CollectionPage", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/collections/7" && !init?.method) return Promise.resolve(detail);
      if (url.startsWith("/api/collections/7/folders?") && init?.method === "DELETE") return Promise.resolve(undefined);
      throw new Error(`Unexpected API call: ${url}`);
    });
  });

  it("opens ready folders, marks unavailable roots and removes membership only", async () => {
    render(<MemoryRouter initialEntries={["/collections/7"]}><Routes><Route path="/collections/:id" element={<CollectionPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Dogs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Beagles/ })).toHaveAttribute("href", "/browse?path=%2Fmedia%2Fbeagles");
    expect(screen.getByText("Root unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Huskies/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Beagles from Dogs" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith(expect.stringContaining("/api/collections/7/folders?"), { method: "DELETE" }));
    expect(screen.queryByText("Beagles")).not.toBeInTheDocument();
    expect(screen.getByText("1 folder, each opening in the regular browser.")).toBeInTheDocument();
  });

  it("ignores a stale response after navigating to another collection", async () => {
    const first = deferred<FolderCollectionDetail>();
    const second = deferred<FolderCollectionDetail>();
    const cats = { ...detail, id: 8, name: "Cats", folders: [] };
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/collections/7") return abortable(first.promise, init?.signal);
      if (url === "/api/collections/8") return abortable(second.promise, init?.signal);
      throw new Error(`Unexpected API call: ${url}`);
    });

    render(<MemoryRouter initialEntries={["/collections/7"]}><Routes><Route path="/collections/:id" element={<><Link to="/collections/8">Next collection</Link><CollectionPage /></>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "Next collection" }));
    await act(async () => second.resolve(cats));
    expect(await screen.findByRole("heading", { name: "Cats" })).toBeInTheDocument();

    await act(async () => first.resolve(detail));
    expect(screen.getByRole("heading", { name: "Cats" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dogs" })).not.toBeInTheDocument();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })),
  ]);
}
