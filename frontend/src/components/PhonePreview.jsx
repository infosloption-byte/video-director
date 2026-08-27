import { IconPlay, IconPause } from "./Icons";
import "./PhonePreview.css";

export default function PhonePreview({ step, duration, cuts, playing, onTogglePlay }) {
  const words = step.line.split(" ");
  const leadWord = words[0];
  const restWords = words.slice(1, 4).join(" ");

  return (
    <div className="hx-preview">
      <div className="hx-preview__frame" style={{ background: step.thumb }}>
        {step.thumbLabel && (
          <div className="hx-preview__altbadge">
            <span className="hx-preview__altdot" aria-hidden="true" />
            {step.thumbLabel}
          </div>
        )}

        <div className="hx-preview__scrim" />

        <div className="hx-preview__captions">
          <p className="hx-preview__caption-lead">{step.title}</p>
          <p className="hx-preview__caption-sub">
            <span className="is-said">{leadWord}</span>{" "}
            <span className="is-pending">{restWords}</span>
          </p>
        </div>

        <div className="hx-preview__controls">
          <button
            className="hx-preview__play"
            onClick={onTogglePlay}
            aria-label={playing ? "Pause preview" : "Play preview"}
          >
            {playing ? <IconPause /> : <IconPlay style={{ marginLeft: 2 }} />}
          </button>
          <div className="hx-preview__scrub">
            <div className="hx-preview__track">
              <div className="hx-preview__fill" style={{ width: playing ? "4%" : "0%" }} />
            </div>
          </div>
          <span className="mono-label hx-preview__time">
            {playing ? "00:01" : "00:00"} / {duration}
          </span>
        </div>
      </div>

      <p className="hx-preview__note">
        9:16 safe zone · captions upper-middle · {cuts} cuts
      </p>
    </div>
  );
}
