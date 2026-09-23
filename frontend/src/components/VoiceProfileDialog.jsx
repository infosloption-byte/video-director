import { useEffect, useRef } from "react";
import "./VoiceProfileDialog.css";

function statusLabel(status) {
  if (status === "ready") return "Ready for narration";
  if (status === "processing") return "Creating voice profile";
  if (status === "failed") return "Needs attention";
  return "Recording in progress";
}

export default function VoiceProfileDialog({
  profile,
  open,
  onClose,
  onContinue,
  onPlaySample,
  playingSample,
  previewLoading,
  previewPlaying,
  onPlayPreview,
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
      onClose?.();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  if (!open || !profile) return null;

  const samples = [...(profile.samples || [])].sort((a, b) => Number(a.sampleIndex) - Number(b.sampleIndex));
  const ready = profile.status === "ready" && Boolean(profile.ttsVoiceId);

  return (
    <dialog ref={dialogRef} className="hx-dialog voice-profile-dialog" aria-labelledby="voice-profile-dialog-title">
      <div className="voice-profile-dialog__surface">
        <header className="voice-profile-dialog__header">
          <div>
            <span className="eyebrow">Voice profile</span>
            <h2 id="voice-profile-dialog-title">{profile.name}</h2>
            <p>{profile.preferredEngine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano"} · {profile.language} · {statusLabel(profile.status)}</p>
          </div>
          <button type="button" className="voice-profile-dialog__close" onClick={onClose} aria-label="Close voice profile">
            ×
          </button>
        </header>

        <section className="voice-profile-dialog__preview" aria-label="Cloned voice preview">
          <div className="voice-profile-dialog__section-head">
            <div>
              <span className="mono-label">CLONED VOICE PREVIEW</span>
              <h3>Hear the saved voice read a sample.</h3>
            </div>
            <span className={"voice-profile-dialog__state " + (ready ? "is-ready" : "")}>
              {ready ? "Voice ready" : "Available after cloning"}
            </span>
          </div>
          <p className="voice-profile-dialog__sample-text">
            “Hello, this is a sample preview of my Helix narrator voice. The same saved voice profile can now read narration naturally and consistently.”
          </p>
          <div className="voice-profile-dialog__preview-actions">
            <button
              type="button"
              className="btn btn-cream"
              onClick={() => onPlayPreview?.(profile)}
              disabled={!ready || previewLoading === profile.id}
            >
              {previewLoading === profile.id ? "Generating preview…" : previewPlaying === profile.id ? "Playing preview…" : "Play cloned voice"}
            </button>
            {!ready && <span>Finish the guided recordings and create the voice profile to enable this preview.</span>}
          </div>
        </section>

        <section className="voice-profile-dialog__tracks" aria-label="Recorded clips">
          <div className="voice-profile-dialog__section-head">
            <div>
              <span className="mono-label">RECORDED CLIPS</span>
              <h3>Your saved recording tracks.</h3>
            </div>
            <span className="voice-profile-dialog__count">{samples.length} saved</span>
          </div>
          {samples.length ? (
            <div className="voice-profile-dialog__track-list">
              {samples.map((sample) => (
                <div className="voice-profile-dialog__track" key={sample.id}>
                  <span className="voice-profile-dialog__track-index">{String(Number(sample.sampleIndex) + 1).padStart(2, "0")}</span>
                  <div className="voice-profile-dialog__track-copy">
                    <strong>Passage {Number(sample.sampleIndex) + 1}</strong>
                    <span>{sample.sizeBytes ? (Math.max(1, Math.round(Number(sample.sizeBytes) / 1024)) + " KB") : "Saved recording"} · Original track</span>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={() => onPlaySample?.(sample)} disabled={playingSample === sample.id}>
                    {playingSample === sample.id ? "Playing…" : "Play"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="voice-profile-dialog__empty">No saved recordings yet.</div>
          )}
        </section>

        <footer className="voice-profile-dialog__footer">
          <span>{ready ? "This voice profile is available from Narration → Saved voice profile." : "You can continue recording from this profile."}</span>
          <div className="voice-profile-dialog__actions">
            {!ready && onContinue && (
              <button type="button" className="btn btn-cream" onClick={onContinue}>
                Continue recording
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
