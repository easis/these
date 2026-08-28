import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cx } from "../lib/cx";
import ui from "../styles/ui.module.css";
import styles from "./TextInputDialog.module.css";

interface TextInputDialogProps {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  description?: string;
  maxLength: number;
  submitLabel: string;
  pendingLabel?: string;
  allowEmpty?: boolean;
  error?: string | null;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  onValueChange?: (value: string) => void;
  onSubmit: (value: string) => Promise<boolean | void>;
  onClose: () => void;
}

export function TextInputDialog({
  title,
  label,
  initialValue = "",
  placeholder,
  description,
  maxLength,
  submitLabel,
  pendingLabel = "Saving…",
  allowEmpty = false,
  error,
  fallbackFocusRef,
  onValueChange,
  onSubmit,
  onClose,
}: TextInputDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const valid = allowEmpty || Boolean(value.trim());

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else if (fallbackFocusRef?.current?.isConnected) fallbackFocusRef.current.focus();
    };
  }, [fallbackFocusRef]);

  const close = () => {
    if (!submittingRef.current) onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current || !valid) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const completed = await onSubmit(value);
      submittingRef.current = false;
      setSubmitting(false);
      if (completed !== false) onClose();
    } catch (caught) {
      submittingRef.current = false;
      setSubmitting(false);
      setSubmitError(caught instanceof Error ? caught.message : "Could not save the change.");
    }
  };

  const describedBy = [description ? descriptionId : null, error || submitError ? errorId : null].filter(Boolean).join(" ") || undefined;

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      aria-busy={submitting}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}
      onClick={(event: MouseEvent<HTMLDialogElement>) => { if (event.target === event.currentTarget) close(); }}
    >
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <div className={styles.heading}>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <label className={styles.field}>
          <span>{label}</span>
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={submitting}
            aria-invalid={Boolean(error || submitError) || undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setSubmitError(null);
              onValueChange?.(event.target.value);
            }}
          />
        </label>
        {error || submitError ? <div id={errorId} className={styles.error} role="alert">{error || submitError}</div> : null}
        <div className={styles.actions}>
          <button className={cx(ui.compactButton, styles.actionButton)} type="button" disabled={submitting} onClick={close}>Cancel</button>
          <button className={cx(ui.compactButton, ui.primary, styles.actionButton)} type="submit" disabled={submitting || !valid}>{submitting ? pendingLabel : submitLabel}</button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
