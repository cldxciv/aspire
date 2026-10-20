"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * Native modal `<dialog>` for the MCP admin page: `showModal()` gives the focus trap, Esc to
 * close and an inert background; when it closes the browser returns focus to the element that
 * opened it. `initialFocus` picks the element focused on open (default: the first focusable one).
 */
export function McpDialog({
  open,
  titleId,
  descriptionId,
  onClose,
  initialFocus,
  children,
}: {
  open: boolean;
  titleId: string;
  descriptionId?: string;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      initialFocus?.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, initialFocus]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      data-surface="light"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),40rem)] overflow-y-auto rounded-card border border-line bg-white p-0 text-ink shadow-card backdrop:bg-navy/60"
    >
      {children}
    </dialog>
  );
}
