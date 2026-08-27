import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Header from "../components/Header";
import PhonePreview from "../components/PhonePreview";
import StepCard from "../components/StepCard";
import FrameworkPanel from "../components/FrameworkPanel";
import PreviewPanel from "../components/PreviewPanel";
import { IconArrowLeft, IconInfo, IconArrowRight, IconCheck } from "../components/Icons";
import { storyboards, frameworks } from "../data/signals";
import "../components/ui.css";
import "./StoryboardPage.css";

const TABS = [
  { n: "01", label: "Framework" },
  { n: "02", label: "Storyboard" },
  { n: "03", label: "Preview" },
];

export default function StoryboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const board = storyboards[id];

  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState("Storyboard");
  const [published, setPublished] = useState(false);

  // Reset local UI state whenever the person opens a different reel.
  useEffect(() => {
    setActiveStep(0);
    setPlaying(false);
    setTab("Storyboard");
    setPublished(false);
  }, [id]);

  if (!board) {
    return (
      <div className="hx-page">
        <Header right={<Link to="/" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
        <div className="container hx-notfound">
          <p>We couldn't find a storyboard for this signal.</p>
          <button className="btn btn-cream" onClick={() => navigate("/")}>Back to signals</button>
        </div>
      </div>
    );
  }

  return (
    <div className="hx-page">
      <Header
        right={
          <Link to="/" className="btn btn-ghost">
            <IconArrowLeft className="btn-icon" /> Signals
          </Link>
        }
      />

      <main className="container hx-board">
        <div className="hx-board__head">
          <div>
            <p className="eyebrow">
              {board.framework} · {board.frameworkName}
            </p>
            <h1 className="hx-board__title">{board.title}</h1>
          </div>

          <div className="hx-tabs" role="tablist" aria-label="Storyboard stage">
            {TABS.map((t) => (
              <button
                key={t.label}
                role="tab"
                aria-selected={tab === t.label}
                className={`hx-tab ${tab === t.label ? "is-active" : ""}`}
                onClick={() => setTab(t.label)}
              >
                <span className="mono-label hx-tab__n">{t.n}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hx-board__layout">
          <PhonePreview
            step={board.steps[activeStep]}
            duration={board.duration}
            cuts={board.cuts}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
          />

          <div className="hx-board__content">
            {tab === "Framework" && (
              <FrameworkPanel
                frameworks={frameworks}
                activeKey={board.frameworkKey}
                onContinue={() => setTab("Storyboard")}
              />
            )}

            {tab === "Storyboard" && (
              <>
                <div className="hx-hookbox">
                  <IconInfo className="hx-hookbox__icon" />
                  <p>
                    <span className="mono-label">HOOK</span> {board.hook}
                  </p>
                </div>

                <div className="hx-steps">
                  {board.steps.map((step, i) => (
                    <StepCard
                      key={step.n}
                      step={step}
                      active={activeStep === i}
                      onFocus={() => {
                        setActiveStep(i);
                        setPlaying(false);
                      }}
                    />
                  ))}
                </div>

                <div className="hx-board__actions">
                  <button className="btn btn-ghost" onClick={() => navigate("/")}>
                    <IconArrowLeft className="btn-icon" /> Back
                  </button>
                  <button className="btn btn-cream" onClick={() => setTab("Preview")}>
                    Preview &amp; publish pack <IconArrowRight className="btn-icon" />
                  </button>
                </div>
              </>
            )}

            {tab === "Preview" &&
              (published ? (
                <div className="hx-published">
                  <span className="hx-published__icon">
                    <IconCheck />
                  </span>
                  <h3>Reel pack published</h3>
                  <p>
                    "{board.title}" is queued for export at {board.duration}, {board.cuts} cuts.
                  </p>
                  <div className="hx-board__actions" style={{ justifyContent: "center", gap: 12 }}>
                    <button className="btn btn-ghost" onClick={() => setPublished(false)}>
                      <IconArrowLeft className="btn-icon" /> Back to preview
                    </button>
                    <button className="btn btn-cream" onClick={() => navigate("/")}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <PreviewPanel
                  board={board}
                  activeStep={activeStep}
                  onSelectStep={(i) => {
                    setActiveStep(i);
                    setPlaying(false);
                  }}
                  onBack={() => setTab("Storyboard")}
                  onPublish={() => setPublished(true)}
                />
              ))}
          </div>
        </div>
      </main>
    </div>
  );
}
