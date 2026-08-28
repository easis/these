import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";

vi.mock("../state/app-context", () => ({
  useApp: () => ({
    bootstrap: {
      roots: [{ id: "photos", label: "Photos", path: "/media/photos", available: true }],
    },
    loading: false,
  }),
}));

describe("HomePage", () => {
  it("keeps the landing page focused on status and useful actions", () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Browse your folders. Keep the files where they are." })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "1 root ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse media/ })).toHaveAttribute("href", "/browse?path=%2Fmedia%2Fphotos");
    expect(screen.queryByText(/presents the image and video folders/i)).not.toBeInTheDocument();
  });
});
