import SceneCustomizePanel from "./SceneCustomizePanel";
import { IconCheck } from "./Icons";
import "./StepCard.css";

export default function StepCard({
  step,
  active,
  onFocus,
  selectedAssetIndex = 0,
  onSelectAsset,
  customizeOpen = false,
  onToggleCustomize,
  customSetup,
  voices = [],
  onPreviewVoice,
  previewingVoice = "",
  previewLoading = "",
  onRewriteScene,
  onChangeSceneVoice,
  onRegenerateVisuals,
  sceneBusy = "",
}) {
  const selected = Math.max(0, Math.min(selectedAssetIndex, (step.swatches || []).length - 1));
  const busy = Boolean(sceneBusy);
  const sceneVoiceLabel = step.customization?.voice?.name || customSetup?.voice?.name || "Project voice";
  const isCustomized = Boolean(step.customization?.customized);

  return (
    <article
      className={"step-card " + (active ? "step-card--active " : "") + (customizeOpen ? "step-card--editing" : "")}
      onClick={onFocus}
      tabIndex={0}
      role="button"
      aria-pressed={active}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onFocus?.(); } }}
    >
      <div className="step-card__thumb" style={{ background: step.thumb }}>
        <span className="step-card__n">{step.n}</span>
        {step.thumbLabel && <span className="step-card__altlabel">{step.thumbLabel}</span>}
        {isCustomized && <span className="step-card__custom-badge">CUSTOM</span>}
      </div>

      <div className="step-card__body">
        <div className="step-card__heading">
          <div className="step-card__heading-main">
            <div className="step-card__eyebrow">
              <span className="mono-label">SCENE {step.n}</span>
              <span className={isCustomized ? "step-card__state is-custom" : "step-card__state"}>{isCustomized ? "Customized" : "Setup defaults"}</span>
            </div>
            <h3 className="step-card__title">{step.title}</h3>
          </div>
          <span className="mono-label step-card__time">{step.time}</span>
        </div>

        <p className="step-card__line">{step.line}</p>
        <p className="step-card__why"><span className="mono-label">WHY THIS LINE</span> {step.whyLine}</p>
        <p className="step-card__why"><span className="mono-label">WHY THIS PICTURE</span> {step.whyPicture}</p>

        <div className="step-card__toolbar" onClick={(event) => event.stopPropagation()}>
          <div className="step-card__voice-summary">
            <span className="mono-label">NARRATOR</span>
            <strong>{sceneVoiceLabel}</strong>
            {isCustomized && <span>Scene-specific</span>}
          </div>
          <div className="step-card__toolbar-actions">
            <button type="button" className={"step-card__tool " + (customizeOpen ? "is-active" : "")} onClick={() => onToggleCustomize?.()} disabled={busy}>
              {customizeOpen ? "Close editor" : "Customize scene"}
            </button>
            <button type="button" className="step-card__tool" onClick={() => onRegenerateVisuals?.()} disabled={busy}>
              {sceneBusy === "visuals" ? "Refreshing…" : "Refresh visuals"}
            </button>
          </div>
        </div>

        <div className="step-card__swap">
          <div className="step-card__swap-head">
            <span className="mono-label">VISUAL OPTIONS</span>
            <span>{step.swatches?.length || 0} ready · select one</span>
          </div>
          <div className="step-card__swatches">
            {(step.swatches || []).map((sw, i) => (
              <button
                type="button"
                key={i}
                className={"step-card__swatch " + (selected === i ? "is-selected" : "")}
                style={{ background: sw }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectAsset?.(i);
                }}
                aria-label={"Use visual option " + (i + 1)}
                aria-pressed={selected === i}
              >
                {selected === i && <IconCheck />}
              </button>
            ))}
          </div>
        </div>

        {customizeOpen && (
          <div onClick={(event) => event.stopPropagation()}>
            <SceneCustomizePanel
              scene={step}
              customSetup={customSetup}
              voices={voices}
              onPreviewVoice={onPreviewVoice}
              previewingVoice={previewingVoice}
              previewLoading={previewLoading}
              onRewrite={onRewriteScene}
              onChangeVoice={onChangeSceneVoice}
              onRegenerateVisuals={onRegenerateVisuals}
              busy={sceneBusy}
            />
          </div>
        )}
      </div>
    </article>
  );
}
