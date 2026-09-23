import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import SelectMenu from "../components/SelectMenu";
import "../components/ui.css";
import "./VoiceProfilesPage.css";

const FALLBACK_PROMPTS = [
  "Today we are going to break down a simple idea and show why it matters.",
  "The most useful way to understand this change is to look at what happens step by step.",
  "There is a practical reason this works, and the evidence becomes clearer when we slow down and look closely.",
  "A good explanation does not rush the important part; it gives each sentence enough room to land naturally.",
  "The goal is not to sound perfect. The goal is to sound like yourself, clearly and consistently.",
  "Now let us connect the pieces and turn the explanation into something practical and easy to remember."
];

const ENGINE_OPTIONS = [
  { value: "qwen3-tts-0.6b", label: "Qwen3-TTS 0.6B" },
  { value: "chatterbox-nano", label: "Chatterbox-Nano" },
];

const ENGINE_DESCRIPTIONS = {
  "qwen3-tts-0.6b": "GPU-powered cloning through the Helix TTS worker.",
  "chatterbox-nano": "A lightweight alternative for voice profile creation.",
};

function chooseMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read recording."));
    reader.readAsDataURL(blob);
  });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? Math.round(bytes / 1024) + " KB" : (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

export default function VoiceProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [prompts, setPrompts] = useState(FALLBACK_PROMPTS);
  const [minSamples, setMinSamples] = useState(2);
  const [maxSamples, setMaxSamples] = useState(8);
  const [name, setName] = useState("");
  const [engine, setEngine] = useState("qwen3-tts-0.6b");
  const [consent, setConsent] = useState(false);
  const [active, setActive] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [recordings, setRecordings] = useState({});
  const [reviewTake, setReviewTake] = useState(null);
  const [playingSample, setPlayingSample] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordingIndex, setRecordingIndex] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [savingSample, setSavingSample] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionFinished, setSessionFinished] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const discardRecordingRef = useRef(false);
  const timerRef = useRef(null);
  const studioRef = useRef(null);

  async function loadProfiles() {
    try {
      const response = await fetch("/api/voice-profiles", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load voice profiles.");
      setProfiles(data.profiles || []);
      setPrompts(data.prompts?.length ? data.prompts : FALLBACK_PROMPTS);
      setMinSamples(Math.max(2, Number(data.minSamples || 2)));
      setMaxSamples(Math.min(8, Number(data.maxSamples || 8)));
    } catch (err) {
      setError(err.message || "Failed to load voice profiles.");
    }
  }

  useEffect(() => {
    void loadProfiles();
    return () => {
      stopStream();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!active?.id) return undefined;
    const timer = window.setTimeout(() => {
      studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [active?.id]);

  useEffect(() => {
    if (!recording) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return undefined;
    }
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [recording]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function firstAvailableStep(profile = active) {
    const used = new Set((profile?.samples || []).map((sample) => sample.sampleIndex));
    return Array.from({ length: Math.min(prompts.length, maxSamples) }, (_, index) => index).find((index) => !used.has(index)) ?? 0;
  }

  function enterProfile(profile) {
    setActive(profile);
    setCurrentStep(firstAvailableStep(profile));
    setReviewTake(null);
    setSessionFinished(false);
    setError("");
    setMessage("");
  }

  async function createProfile() {
    const trimmedName = name.trim();
    setError("");
    setMessage("");
    if (!trimmedName) {
      setError("Enter a name for this voice profile.");
      return;
    }
    if (!consent) {
      setError("Confirm that these recordings are your voice or that you have permission to use them.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/voice-profiles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, preferredEngine: engine, language: "English", consentAccepted: true })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create voice profile.");
      setProfiles((current) => [data, ...current]);
      setName("");
      setConsent(false);
      setActive(data);
      setCurrentStep(0);
      setReviewTake(null);
      setSessionFinished(false);
      setMessage("Session ready. Read the sentence below in your natural voice.");
    } catch (err) {
      setError(err.message || "Failed to create voice profile.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRecording(sampleIndex, blob, mimeType) {
    if (!active) return;
    setSavingSample(sampleIndex);
    setError("");
    setMessage("");
    try {
      const audioBase64 = await readAsDataUrl(blob);
      const response = await fetch("/api/voice-profiles/" + active.id + "/samples", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleIndex,
          promptText: prompts[sampleIndex],
          audioBase64,
          mimeType,
          filename: "voice-sample-" + (sampleIndex + 1)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save recording.");
      setActive(data.profile);
      setProfiles((current) => current.map((profile) => profile.id === data.profile.id ? data.profile : profile));
      setReviewTake({ sampleIndex, blob, url: URL.createObjectURL(blob), mimeType });
      setMessage("Take saved. Listen back, retake it, or continue to the next sentence.");
    } catch (err) {
      setError(err.message || "Failed to save recording.");
    } finally {
      setSavingSample(null);
    }
  }

  async function startRecording(index = currentStep) {
    if (recording || savingSample !== null || busy || sessionFinished) return;
    setError("");
    setMessage("");
    setReviewTake(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support microphone recording. Use a current Chrome or Edge browser.");
      return;
    }
    try {
      const mimeType = chooseMimeType();
      if (!mimeType) throw new Error("No supported audio recording format was found.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      chunksRef.current = [];
      discardRecordingRef.current = false;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.onerror = () => {
        setRecording(false);
        setRecordingIndex(null);
        setError("Microphone recording failed.");
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const discard = discardRecordingRef.current;
        stopStream();
        setRecording(false);
        setRecordingIndex(null);
        setElapsedSeconds(0);
        chunksRef.current = [];
        if (!discard && blob.size > 0) {
          setRecordings((current) => ({ ...current, [index]: { blob, url: URL.createObjectURL(blob), mimeType } }));
          void saveRecording(index, blob, mimeType);
        } else if (discard) {
          setMessage("Take cancelled. Nothing was saved.");
        }
      };
      setElapsedSeconds(0);
      recorder.start(200);
      setRecording(true);
      setRecordingIndex(index);
    } catch (err) {
      stopStream();
      setRecording(false);
      setRecordingIndex(null);
      setError(err.message || "Microphone access failed.");
    }
  }

  function stopAndSave() {
    discardRecordingRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  function cancelTake() {
    discardRecordingRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    else {
      stopStream();
      setRecording(false);
      setRecordingIndex(null);
    }
  }

  async function playRecording(item, id) {
    if (!item?.url && !item?.audioUrl) return;
    try {
      let blobUrl = item.url;
      let shouldRevoke = false;
      if (!blobUrl && item.audioUrl) {
        const response = await fetch(item.audioUrl, { credentials: "include" });
        if (!response.ok) throw new Error("Recording could not be loaded.");
        blobUrl = URL.createObjectURL(await response.blob());
        shouldRevoke = true;
      }
      setPlayingSample(id);
      const audio = new Audio(blobUrl);
      audio.onended = () => {
        setPlayingSample(null);
        if (shouldRevoke) URL.revokeObjectURL(blobUrl);
      };
      await audio.play();
    } catch (err) {
      setError(err.message || "Recording playback failed.");
      setPlayingSample(null);
    }
  }

  function retake() {
    setReviewTake(null);
    void startRecording(currentStep);
  }

  function nextStep() {
    const step = currentStep + 1;
    if (step >= Math.min(prompts.length, maxSamples)) {
      setSessionFinished(true);
      return;
    }
    setCurrentStep(step);
    setReviewTake(null);
    setMessage("");
    setError("");
  }

  function skipStep() {
    if (currentStep < minSamples && Number(active?.sampleCount || 0) < minSamples) {
      setError("Record at least " + minSamples + " clean takes before skipping ahead.");
      return;
    }
    nextStep();
  }

  function finishSession() {
    if (Number(active?.sampleCount || 0) < minSamples) {
      setError("Save at least " + minSamples + " recordings before finishing the session.");
      return;
    }
    setSessionFinished(true);
    setReviewTake(null);
    setError("");
    setMessage("");
  }

  function exitSession() {
    stopStream();
    setRecording(false);
    setRecordingIndex(null);
    setReviewTake(null);
    setSessionFinished(false);
    setActive(null);
    setMessage("Recording session saved. You can reopen the draft profile from your library.");
  }

  async function cloneProfile() {
    if (!active || Number(active.sampleCount || 0) < minSamples || busy) return;
    setBusy(true);
    setError("");
    setMessage("Cleaning the saved takes, combining them, and creating your voice…");
    try {
      const response = await fetch("/api/voice-profiles/" + active.id + "/clone", {
        method: "POST",
        credentials: "include"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create voice profile.");
      setActive(data.profile);
      setProfiles((current) => current.map((profile) => profile.id === data.profile.id ? data.profile : profile));
      setSessionFinished(false);
      setMessage("Voice profile complete. It is now ready to use in Storyboard narration.");
    } catch (err) {
      setError(err.message || "Failed to create voice profile.");
      await loadProfiles();
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile(profile) {
    if (!window.confirm("Delete " + profile.name + " and all stored recordings?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/voice-profiles/" + profile.id, {
        method: "DELETE",
        credentials: "include"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete voice profile.");
      }
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      if (active?.id === profile.id) setActive(null);
      setMessage("Voice profile deleted.");
    } catch (err) {
      setError(err.message || "Failed to delete voice profile.");
    } finally {
      setBusy(false);
    }
  }

  const savedCount = Number(active?.sampleCount || 0);
  const stepCount = Math.min(prompts.length, maxSamples);
  const ready = active?.status === "ready";
  const currentPrompt = prompts[currentStep] || "";
  const currentSaved = active?.samples?.find((sample) => sample.sampleIndex === currentStep);
  const canSkip = currentStep >= minSamples || savedCount >= minSamples;
  const canFinish = savedCount >= minSamples;
  const stepsCompleted = active ? Math.min(stepCount, currentStep + (currentSaved ? 1 : 0)) : 0;

  return (
    <div className="hx-page voice-profiles-page">
      <Header right={<Link to="/my-research" className="btn btn-ghost">My Research</Link>} />
      <main className="container voice-profiles-page__main">
        <section className="voice-profiles-page__hero">
          <div className="voice-profiles-page__hero-copy">
            <p className="eyebrow">Voice Profiles</p>
            <h1>Create your narrator voice.</h1>
            <p>Record a few short sentences in your natural voice. Helix keeps the individual takes, cleans them during cloning, and turns them into one reusable narrator profile.</p>
          </div>
          <div className="voice-profiles-page__hero-steps" aria-label="Voice profile workflow">
            <span><b>01</b> Record</span>
            <span><b>02</b> Review</span>
            <span><b>03</b> Create voice</span>
          </div>
        </section>

        {error && <div className="voice-profiles-page__alert" role="alert">{error}</div>}
        {message && <div className="voice-profiles-page__success" role="status">{message}</div>}

        {!active ? (
          <section className="voice-profiles-page__card voice-profiles-page__setup">
            <div className="voice-profiles-page__card-head">
              <div>
                <span className="eyebrow">Start a session</span>
                <h2>One sentence at a time.</h2>
                <p>We will guide you through the prompts one by one. The first {minSamples} good takes are required; the remaining prompts are optional.</p>
              </div>
              <span className="voice-profiles-page__badge">{minSamples} minimum · {stepCount} prompts</span>
            </div>

            <div className="voice-profiles-page__form">
              <label className="voice-profiles-page__field">
                <span>Profile name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. My narrator voice" maxLength={120} autoComplete="off" />
              </label>
              <div className="voice-profiles-page__engine-field">
                <SelectMenu label="Clone engine" value={engine} options={ENGINE_OPTIONS} onChange={setEngine} ariaLabel="Voice cloning engine" />
                <p>{ENGINE_DESCRIPTIONS[engine]}</p>
              </div>
            </div>

            <label className={"voice-profiles-page__consent " + (consent ? "is-checked" : "")}>
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span><strong>Voice ownership &amp; consent</strong>I confirm these recordings are my voice or I have permission to use them, and I want Helix to store and use them to create narration.</span>
            </label>

            <div className="voice-profiles-page__create-row">
              <button type="button" className="btn btn-cream voice-profiles-page__create-button" onClick={createProfile} disabled={busy}>
                {busy ? "Creating session…" : "Start recording"} <span aria-hidden="true">→</span>
              </button>
              <span>2 required takes · optional extra takes for a stronger reference</span>
            </div>
          </section>
        ) : ready ? (
          <section ref={studioRef} className="voice-profiles-page__card voice-profiles-page__complete">
            <div className="voice-profiles-page__complete-icon" aria-hidden="true">✓</div>
            <p className="eyebrow">Voice profile ready</p>
            <h2>{active.name}</h2>
            <p>Your cloned voice is ready for narration. You can select this profile from Storyboard → Narration.</p>
            <div className="voice-profiles-page__complete-meta">
              <span>{savedCount} recordings kept</span>
              <span>{engine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano"}</span>
            </div>
            <div className="voice-profiles-page__complete-actions">
              <button type="button" className="btn btn-ghost" onClick={exitSession}>Back to voice profiles</button>
            </div>
          </section>
        ) : (
          <section ref={studioRef} className="voice-profiles-page__card voice-profiles-page__studio">
            <div className="voice-profiles-page__studio-top">
              <div>
                <span className="eyebrow">Recording session</span>
                <h2>{active.name}</h2>
                <p>{savedCount} of {stepCount} takes saved · {minSamples} required</p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={exitSession} disabled={recording || savingSample !== null || busy}>Exit session</button>
            </div>

            <div className="voice-profiles-page__stepbar">
              <div className="voice-profiles-page__stepbar-copy">
                <span>Step {Math.min(currentStep + 1, stepCount)} of {stepCount}</span>
                <strong>{savedCount} saved</strong>
              </div>
              <div className="voice-profiles-page__stepbar-track">
                <span style={{ width: ((Math.min(currentStep + 1, stepCount) / Math.max(stepCount, 1)) * 100) + "%" }} />
              </div>
            </div>

            {!sessionFinished ? (
              <>
                <div className={"voice-profiles-page__prompt-card " + (recording ? "is-recording" : "")}>
                  <div className="voice-profiles-page__prompt-top">
                    <span className="voice-profiles-page__prompt-number">{String(currentStep + 1).padStart(2, "0")}</span>
                    <span className="voice-profiles-page__prompt-tag">{currentStep < minSamples ? "Required" : "Optional"}</span>
                  </div>
                  <p className="mono-label">Read this naturally</p>
                  <blockquote>“{currentPrompt}”</blockquote>
                  <p className="voice-profiles-page__prompt-tip">Speak at your normal pace. Keep the microphone close and avoid changing your voice between takes.</p>

                  <div className="voice-profiles-page__record-state">
                    <span className={"voice-profiles-page__record-dot " + (recording ? "is-live" : "")} aria-hidden="true" />
                    <strong>{recording ? formatTime(elapsedSeconds) : savingSample !== null ? "Saving take…" : currentSaved ? "Take saved" : "Ready to record"}</strong>
                    {recording && <span>Speak the sentence above, then stop.</span>}
                  </div>

                  {!recording && !savingSample && !reviewTake && (
                    <div className="voice-profiles-page__prompt-actions">
                      <button type="button" className="btn btn-cream voice-profiles-page__record-button" onClick={() => startRecording(currentStep)} disabled={busy}>● Record this sentence</button>
                      {currentSaved && <button type="button" className="btn btn-ghost" onClick={() => playRecording(currentSaved, currentSaved.id)} disabled={playingSample !== null}>{playingSample === currentSaved.id ? "Playing…" : "Play saved take"}</button>}
                    </div>
                  )}

                  {recording && (
                    <div className="voice-profiles-page__recording-actions">
                      <button type="button" className="btn btn-cream voice-profiles-page__record-button" onClick={stopAndSave}>Stop &amp; keep take</button>
                      <button type="button" className="btn btn-danger-soft" onClick={cancelTake}>Cancel take</button>
                    </div>
                  )}

                  {savingSample !== null && <div className="voice-profiles-page__saving-note">Uploading this take securely…</div>}

                  {reviewTake && savingSample === null && (
                    <div className="voice-profiles-page__review">
                      <div className="voice-profiles-page__review-copy">
                        <span className="mono-label">Take {currentStep + 1} saved</span>
                        <strong>How does it sound?</strong>
                        <span>{formatBytes(reviewTake.blob.size)} · ready for the next step</span>
                      </div>
                      <div className="voice-profiles-page__review-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => playRecording(reviewTake, "review-" + reviewTake.sampleIndex)} disabled={playingSample !== null}>
                          {playingSample === "review-" + reviewTake.sampleIndex ? "Playing…" : "Play take"}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={retake} disabled={busy}>Retake</button>
                        <button type="button" className="btn btn-cream" onClick={nextStep}>Continue →</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="voice-profiles-page__studio-footer">
                  <button type="button" className="voice-profiles-page__text-button" onClick={skipStep} disabled={!canSkip || recording || savingSample !== null || busy}>Skip this sentence</button>
                  <button type="button" className="btn btn-ghost" onClick={finishSession} disabled={!canFinish || recording || savingSample !== null || busy}>Finish &amp; review takes</button>
                </div>
              </>
            ) : (
              <div className="voice-profiles-page__final-review">
                <div className="voice-profiles-page__final-review-head">
                  <div>
                    <span className="eyebrow">Ready to create</span>
                    <h3>{savedCount} recording{savedCount === 1 ? "" : "s"} saved</h3>
                    <p>These takes will be cleaned, combined, and used to create your reusable voice profile.</p>
                  </div>
                  <span className="voice-profiles-page__ready-badge">{savedCount} takes</span>
                </div>
                <div className="voice-profiles-page__take-list">
                  {active.samples?.map((sample) => (
                    <div key={sample.id} className="voice-profiles-page__take-item">
                      <span className="voice-profiles-page__take-index">{String(sample.sampleIndex + 1).padStart(2, "0")}</span>
                      <div><strong>{sample.promptText}</strong><span>{formatBytes(sample.sizeBytes)} · saved</span></div>
                      <button type="button" className="btn btn-ghost" onClick={() => playRecording(sample, sample.id)} disabled={playingSample !== null}>{playingSample === sample.id ? "Playing…" : "Play"}</button>
                    </div>
                  ))}
                </div>
                <div className="voice-profiles-page__final-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => { setSessionFinished(false); setCurrentStep(firstAvailableStep()); setReviewTake(null); }}>Add another take</button>
                  <button type="button" className="btn btn-cream" onClick={cloneProfile} disabled={busy || !canFinish}>{busy ? "Creating voice…" : "Create voice profile"} <span aria-hidden="true">→</span></button>
                </div>
                <p className="voice-profiles-page__final-note">Helix keeps the individual recordings in this profile for future re-processing. The clone is generated from the saved takes above.</p>
              </div>
            )}
          </section>
        )}

        <section className="voice-profiles-page__library">
          <div className="voice-profiles-page__library-head">
            <div><p className="eyebrow">Your library</p><h2>Saved voice profiles</h2></div>
            <span>{profiles.length} profile{profiles.length === 1 ? "" : "s"}</span>
          </div>
          {!profiles.length ? (
            <p className="voice-profiles-page__empty">No voice profiles yet.</p>
          ) : (
            <div className="voice-profiles-page__grid">
              {profiles.map((profile) => (
                <article key={profile.id} className="voice-profiles-page__profile">
                  <div className="voice-profiles-page__profile-top">
                    <span className={"voice-profiles-page__status is-" + profile.status}>{profile.status}</span>
                    <span>{profile.sampleCount} takes</span>
                  </div>
                  <h3>{profile.name}</h3>
                  <p>{profile.preferredEngine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano"} · {profile.language}</p>
                  <div className="voice-profiles-page__profile-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => enterProfile(profile)} disabled={busy}>Open</button>
                    <button type="button" className="btn btn-ghost" onClick={() => deleteProfile(profile)} disabled={busy}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
