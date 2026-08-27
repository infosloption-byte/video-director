import { useState } from "react";
import { IconCheck } from "./Icons";
import "./StepCard.css";

export default function StepCard({ step, active, onFocus }) {
  const [selected, setSelected] = useState(0);

  return (
    <article
      className={`step-card ${active ? "step-card--active" : ""}`}
      onClick={onFocus}
      tabIndex={0}
      role="button"
      aria-pressed={active}
    >
      <div className="step-card__thumb" style={{ background: step.thumb }}>
        <span className="step-card__n">{step.n}</span>
        {step.thumbLabel && (
          <span className="step-card__altlabel">{step.thumbLabel}</span>
        )}
      </div>

      <div className="step-card__body">
        <div className="step-card__heading">
          <h3 className="step-card__title">{step.title}</h3>
          <span className="mono-label step-card__time">{step.time}</span>
        </div>

        <p className="step-card__line">{step.line}</p>

        <p className="step-card__why">
          <span className="mono-label">WHY THIS LINE</span> {step.whyLine}
        </p>
        <p className="step-card__why">
          <span className="mono-label">WHY THIS PICTURE</span> {step.whyPicture}
        </p>

        <div className="step-card__swap">
          <span className="mono-label">SWAP VISUAL · {step.swatches.length} PREFETCHED</span>
          <div className="step-card__swatches">
            {step.swatches.map((sw, i) => (
              <button
                key={i}
                className={`step-card__swatch ${selected === i ? "is-selected" : ""}`}
                style={{ background: sw }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(i);
                }}
                aria-label={`Use visual option ${i + 1}`}
                aria-pressed={selected === i}
              >
                {selected === i && <IconCheck />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
