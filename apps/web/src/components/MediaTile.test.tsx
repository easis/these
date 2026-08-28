import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaTile } from "./MediaTile";
import styles from "./MediaTile.module.css";

describe("MediaTile classification", () => {
  it("offers three compact toggle controls and shortcut 3", () => {
    const onStatus = vi.fn();
    const { container } = render(<MediaTile media={{ path: "/media/photo.jpg", name: "photo.jpg", kind: "image", size: 1, modifiedAt: "", status: null }} size={160} activeList onOpen={() => undefined} onStatus={onStatus} />);
    expect(screen.getByRole("button", { name: "Mark selected" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark maybe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark discarded" })).toBeInTheDocument();
    fireEvent.keyDown(container.querySelector("article")!, { key: "3" });
    expect(onStatus).toHaveBeenCalledWith("discarded");
  });

  it("styles discarded state on the tile without changing its caption controls", () => {
    const { container } = render(<MediaTile media={{ path: "/media/photo.jpg", name: "photo.jpg", kind: "image", size: 1, modifiedAt: "", status: "discarded" }} size={160} activeList onOpen={() => undefined} onStatus={() => undefined} />);
    expect(container.querySelector("article")).toHaveClass(styles.discarded!);
    expect(screen.getByRole("button", { name: "Remove discarded status" })).toHaveAttribute("aria-pressed", "true");
  });
});
