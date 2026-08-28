import { useEffect, useRef } from "react";
import "./ConfirmDialog.css";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const handleCancel = (event) => {
      event.preventDefault();
      onCancel?.();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onCancel]);

  if (!open) return null;

  return (
    <dialog ref={dialogRef} className={`hx-dialog hx-dialog--${tone}`} aria-labelledby="hx-dialog-title">
      <div className="hx-dialog__surface">
        <div className="hx-dialog__icon" aria-hidden="true">{tone === "danger" ? "!" : "i"}</div>
        <div className="hx-dialog__content">
          <h2 id="hx-dialog-title">{title}</h2>
          <p>{message}</p>
        </div>
        <div className="hx-dialog__actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={`btn ${tone === "danger" ? "btn-danger" : "btn-cream"}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
