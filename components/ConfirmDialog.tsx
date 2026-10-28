"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/*
 * In-app confirmation dialog (instead of the browser's confirm(), which draws
 * its own box above the page and hides the custom cursor).
 * Escape or a click outside cancels; focus moves to the safe choice first.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reduced = useReducedMotion();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && cancel.current();
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-back"
          onClick={onCancel}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-lenis-prevent
        >
          <motion.div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-body"
            onClick={(e) => e.stopPropagation()}
            initial={reduced ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <h2 id="confirm-title" style={{ fontSize: "1.6rem" }}>
              {title}
            </h2>
            <p id="confirm-body" className="muted" style={{ marginTop: 10 }}>
              {body}
            </p>
            <div className="row" style={{ marginTop: 28, justifyContent: "flex-end" }}>
              <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy}>
                Keep it
              </button>
              <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
                {busy ? "Deleting…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
