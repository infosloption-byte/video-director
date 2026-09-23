import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header";
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

export default function VoiceProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [prompts, setPrompts] = useState(FALLBACK_PROMPTS);
  const [minSamples, setMinSamples] = useState(3);
  const [maxSamples, setMaxSamples] = useState(8);
  const [name, setName] = useState("");
  const [engine, setEngine] = useState("qwen3-tts-0.6b");
  const [consent, setConsent] = useState(false);
  const [active, setActive] = useState(null);
  const [recordings, setRecordings] = useState({});
  const [playingSample, setPlayingSample] = useState(null);
  const [recording, setRecording] = useState(false);
  const [savingSample, setSavingSample] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  async function loadProfiles() {
    try {
      const response = await fetch("/api/voice-profiles", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load voice profiles.");
      setProfiles(data.profiles || []);
      setPrompts(data.prompts?.length ? data.prompts : FALLBACK_PROMPTS);
      setMinSamples(Number(data.minSamples || 3));
      setMaxSamples(Number(data.maxSamples || 8));
    } catch (err) { setError(err.message || "Failed to load voice profiles."); }
  }

  useEffect(() => {
    void loadProfiles();
    return () => { streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function createProfile() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/voice-profiles", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), preferredEngine: engine, language: "English", consentAccepted: consent })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create voice profile.");
      setActive(data); setProfiles((current) => [data, ...current]); setName(""); setConsent(false);
      setMessage("Profile created. Start recording the guided samples below.");
    } catch (err) { setError(err.message || "Failed to create voice profile."); }
    finally { setBusy(false); }
  }

  async function saveRecording(sampleIndex, blob, mimeType) {
    if (!active) return;
    setSavingSample(sampleIndex); setError(""); setMessage("");
    try {
      const audioBase64 = await readAsDataUrl(blob);
      const response = await fetch("/api/voice-profiles/" + active.id + "/samples", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleIndex, promptText: prompts[sampleIndex], audioBase64, mimeType, filename: "voice-sample-" + (sampleIndex + 1) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save recording.");
      setActive(data.profile);
      setProfiles((current) => current.map((profile) => profile.id === data.profile.id ? data.profile : profile));
      setMessage("Recording " + (sampleIndex + 1) + " saved.");
    } catch (err) { setError(err.message || "Failed to save recording."); }
    finally { setSavingSample(null); }
  }

  async function startRecording(index) {
    if (recording || savingSample !== null) return;
    setError(""); setMessage("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support microphone recording. Use a current Chrome or Edge browser.");
      return;
    }
    try {
      const mimeType = chooseMimeType();
      if (!mimeType) throw new Error("No supported audio recording format was found.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream; chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType }); recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => setError("Microphone recording failed.");
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stopStream(); setRecording(false);
        setRecordings((current) => ({ ...current, [index]: { blob, url: URL.createObjectURL(blob), mimeType } }));
        void saveRecording(index, blob, mimeType);
      };
      recorder.start(250); setRecording(true);
    } catch (err) { stopStream(); setRecording(false); setError(err.message || "Microphone access failed."); }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  async function playSample(sample) {
    try {
      let blobUrl = null;
      if (sample.audioUrl) {
        const response = await fetch(sample.audioUrl, { credentials: "include" });
        if (!response.ok) throw new Error("Recording could not be loaded.");
        blobUrl = URL.createObjectURL(await response.blob());
      } else if (recordings[sample.sampleIndex]) {
        blobUrl = recordings[sample.sampleIndex].url;
      }
      if (!blobUrl) return;
      setPlayingSample(sample.id || ("local-" + sample.sampleIndex));
      const audio = new Audio(blobUrl);
      audio.onended = () => { setPlayingSample(null); if (sample.audioUrl) URL.revokeObjectURL(blobUrl); };
      await audio.play();
    } catch (err) { setError(err.message || "Recording playback failed."); }
  }

  async function cloneProfile() {
    if (!active || Number(active.sampleCount || 0) < minSamples || busy) return;
    setBusy(true); setError(""); setMessage("Combining recordings and creating the cloned voice…");
    try {
      const response = await fetch("/api/voice-profiles/" + active.id + "/clone", { method: "POST", credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create voice clone.");
      setActive(data.profile);
      setProfiles((current) => current.map((profile) => profile.id === data.profile.id ? data.profile : profile));
      setMessage("Voice profile is ready and can now be used for narration.");
    } catch (err) { setError(err.message || "Failed to create voice clone."); await loadProfiles(); }
    finally { setBusy(false); }
  }

  async function deleteProfile(profile) {
    if (!window.confirm("Delete " + profile.name + " and its stored recordings?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/voice-profiles/" + profile.id, { method: "DELETE", credentials: "include" });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Failed to delete voice profile."); }
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      if (active?.id === profile.id) setActive(null);
      setMessage("Voice profile deleted.");
    } catch (err) { setError(err.message || "Failed to delete voice profile."); }
    finally { setBusy(false); }
  }

  const savedCount = Number(active?.sampleCount || 0);
  const progress = Math.min(100, Math.round((savedCount / Math.max(maxSamples, 1)) * 100));
  const ready = active?.status === "ready";

  return (
    <div className="hx-page voice-profiles-page">
      <Header right={<Link to="/my-research" className="btn btn-ghost">My Research</Link>} />
      <main className="container voice-profiles-page__main">
        <section className="voice-profiles-page__hero">
          <p className="eyebrow">Voice Profiles</p>
          <h1>Create your narrator voice.</h1>
          <p>Record guided samples in your own voice. Helix keeps those recordings with your account and builds a reusable voice profile for narration.</p>
        </section>
        {error && <div className="voice-profiles-page__alert" role="alert">{error}</div>}
        {message && <div className="voice-profiles-page__success" role="status">{message}</div>}

        {!active ? (
          <section className="voice-profiles-page__card">
            <div className="voice-profiles-page__card-head"><div><span className="eyebrow">New profile</span><h2>Set up your recording session.</h2></div><span className="voice-profiles-page__badge">3–8 samples</span></div>
            <div className="voice-profiles-page__form">
              <label><span>Profile name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="My narrator voice" maxLength={120} /></label>
              <label><span>Clone engine</span><select value={engine} onChange={(event) => setEngine(event.target.value)}><option value="qwen3-tts-0.6b">Qwen3-TTS 0.6B</option><option value="chatterbox-nano">Chatterbox-Nano</option></select></label>
            </div>
            <label className="voice-profiles-page__consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I confirm these recordings are my voice or I have permission to use them, and I want Helix to store and use them to create narration.</span></label>
            <button className="btn btn-cream" onClick={createProfile} disabled={busy || !name.trim() || !consent}>Create recording session →</button>
          </section>
        ) : (
          <section className="voice-profiles-page__card">
            <div className="voice-profiles-page__card-head">
              <div><span className="eyebrow">{ready ? "Profile ready" : "Recording studio"}</span><h2>{active.name}</h2><p>{ready ? "This voice can be selected in Storyboard narration." : "Record at least " + minSamples + " clear samples. More consistent samples can improve the resulting clone."}</p></div>
              <button className="btn btn-ghost" onClick={() => setActive(null)}>New profile</button>
            </div>
            <div className="voice-profiles-page__progress-head"><span>Samples recorded</span><strong>{savedCount} / {maxSamples}</strong></div>
            <div className="voice-profiles-page__progress"><span style={{ width: progress + "%" }} /></div>
            {!ready && <div className="voice-profiles-page__samples">
              {prompts.slice(0, maxSamples).map((prompt, index) => {
                const saved = active.samples?.find((sample) => sample.sampleIndex === index);
                const local = recordings[index];
                return (
                  <article key={index} className={"voice-profiles-page__sample " + (saved ? "is-saved" : "")}>
                    <div className="voice-profiles-page__sample-head"><span className="voice-profiles-page__sample-index">{String(index + 1).padStart(2, "0")}</span><div><span className="mono-label">READ ALOUD</span><strong>{prompt}</strong></div></div>
                    <div className="voice-profiles-page__sample-actions">
                      <button className="btn btn-ghost" onClick={() => startRecording(index)} disabled={recording || savingSample !== null || busy}>{recording ? "Recording…" : saved ? "Re-record" : "Record sample"}</button>
                      {recording && <button className="btn btn-cream" onClick={stopRecording}>Stop & save</button>}
                      {saved && <button className="btn btn-ghost" onClick={() => playSample(saved)} disabled={savingSample !== null}>{playingSample === saved.id ? "Playing…" : "Play recording"}</button>}
                      {local && !saved && <button className="btn btn-ghost" onClick={() => playSample({ sampleIndex: index })}>Play latest</button>}
                    </div>
                    {saved && <div className="voice-profiles-page__sample-meta">{saved.filename || ("Recording " + (index + 1))} · {formatBytes(saved.sizeBytes)} · Saved</div>}
                    {index + 1 > minSamples && !saved && <span className="voice-profiles-page__sample-optional">Optional · the first {minSamples} samples are the minimum.</span>}
                  </article>
                );
              })}
            </div>}
            {!ready && <div className="voice-profiles-page__clone-actions"><button className="btn btn-cream" onClick={cloneProfile} disabled={busy || savedCount < minSamples}>Create voice profile ({savedCount}/{minSamples}) →</button><span>Helix combines the saved samples into one normalized reference recording before sending it to the selected cloning engine.</span></div>}
            {ready && <div className="voice-profiles-page__ready"><strong>Ready for narration.</strong><span>Open a project storyboard and choose this profile under Narration → Saved voice profile.</span></div>}
          </section>
        )}

        <section className="voice-profiles-page__library">
          <div className="voice-profiles-page__library-head"><div><p className="eyebrow">Your library</p><h2>Saved voice profiles</h2></div><span>{profiles.length} profile{profiles.length === 1 ? "" : "s"}</span></div>
          {!profiles.length ? <p className="voice-profiles-page__empty">No voice profiles yet.</p> : (
            <div className="voice-profiles-page__grid">
              {profiles.map((profile) => <article key={profile.id} className="voice-profiles-page__profile">
                <div className="voice-profiles-page__profile-top"><span className={"voice-profiles-page__status is-" + profile.status}>{profile.status}</span><span>{profile.sampleCount} samples</span></div>
                <h3>{profile.name}</h3>
                <p>{profile.preferredEngine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano"} · {profile.language}</p>
                <div className="voice-profiles-page__profile-actions"><button className="btn btn-ghost" onClick={() => setActive(profile)}>Open</button><button className="btn btn-ghost" onClick={() => deleteProfile(profile)} disabled={busy}>Delete</button></div>
              </article>)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
