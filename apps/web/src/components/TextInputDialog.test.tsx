import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TextInputDialog } from "./TextInputDialog";

describe("TextInputDialog", () => {
  it("focuses and selects the initial value, submits with Enter, and restores focus", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<DialogHarness onSubmit={submit} />);

    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByRole("textbox", { name: "List name" });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("Archive");
    expect(input).toHaveProperty("selectionStart", 0);
    expect(input).toHaveProperty("selectionEnd", 7);

    await user.clear(input);
    await user.type(input, "Final{Enter}");

    await waitFor(() => expect(submit).toHaveBeenCalledWith("Final"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("validates required values and allows an empty optional value", () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<TextInputDialog title="Create list" label="List name" maxLength={100} submitLabel="Create list" onSubmit={submit} onClose={() => undefined} />);
    expect(screen.getByRole("button", { name: "Create list" })).toBeDisabled();

    rerender(<TextInputDialog title="Edit alias" label="Folder alias" maxLength={160} submitLabel="Save alias" allowEmpty onSubmit={submit} onClose={() => undefined} />);
    expect(screen.getByRole("button", { name: "Save alias" })).toBeEnabled();
  });

  it("stays open on failure, reports the error, and blocks duplicate submissions", async () => {
    let reject!: (reason?: unknown) => void;
    const submit = vi.fn().mockReturnValue(new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    render(<TextInputDialog title="Create list" label="List name" initialValue="Archive" maxLength={100} submitLabel="Create list" onSubmit={submit} onClose={() => undefined} />);

    const form = screen.getByRole("textbox", { name: "List name" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Create list" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    reject(new Error("List name already exists."));
    expect(await screen.findByRole("alert")).toHaveTextContent("List name already exists.");
    expect(screen.getByRole("dialog", { name: "Create list" })).toBeInTheDocument();
  });

  it("cancels with Escape or the backdrop while idle", () => {
    const close = vi.fn();
    const { unmount } = render(<TextInputDialog title="Edit alias" label="Folder alias" maxLength={160} submitLabel="Save alias" allowEmpty onSubmit={vi.fn()} onClose={close} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Folder alias" }), { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();

    unmount();
    close.mockReset();
    render(<TextInputDialog title="Edit alias" label="Folder alias" maxLength={160} submitLabel="Save alias" allowEmpty onSubmit={vi.fn()} onClose={close} />);
    fireEvent.click(screen.getByRole("dialog", { name: "Edit alias" }));
    expect(close).toHaveBeenCalledOnce();
  });
});

function DialogHarness({ onSubmit }: { onSubmit: (value: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>Open dialog</button>{open ? <TextInputDialog title="Rename list" label="List name" initialValue="Archive" maxLength={100} submitLabel="Save name" onSubmit={onSubmit} onClose={() => setOpen(false)} /> : null}</>;
}
