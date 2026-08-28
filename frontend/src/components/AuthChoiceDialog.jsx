import { useEffect, useRef } from "react";
import "./AuthChoiceDialog.css";

export default function AuthChoiceDialog({ open, title, message, onSignIn, onSignUp, onClose }) {
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
      onClose?.();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  if (!open) return null;

  return (
    <dialog ref={dialogRef} className="hx-auth-choice" aria-labelledby="hx-auth-choice-title">
      <div className="hx-auth-choice__surface">
        <button type="button" className="hx-auth-choice__close" aria-label="Close" onClick={onClose}>×</button>
        <p className="eyebrow">Ready to direct?</p>
        <h2 id="hx-auth-choice-title">{title}</h2>
        <p>{message}</p>
        <div className="hx-auth-choice__actions">
          <button type="button" className="btn btn-cream" onClick={onSignUp}>Create free account →</button>
          <button type="button" className="btn btn-ghost" onClick={onSignIn}>Sign in</button>
        </div>
        <p className="hx-auth-choice__note">Your selected signal remains available on this page.</p>
      </div>
    </dialog>
  );
}
