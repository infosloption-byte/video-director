import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import ConfirmDialog from "../components/ConfirmDialog";
import SelectMenu from "../components/SelectMenu";
import VoiceProfileDialog from "../components/VoiceProfileDialog";
import "../components/ui.css";
import "./VoiceProfilesPage.css";

const FALLBACK_PROMPTS = [
  "Thanks for taking a moment to record your voice. In this first passage, speak in your normal everyday style, at a comfortable pace, as though you are explaining something useful to a friend. Keep your voice relaxed and steady. There is no need to perform, whisper, or project more than you normally would. Just read naturally, and leave a brief pause when you reach a full stop.",
  "Let us add a little more variety to the recording. Imagine you are telling a short story about a busy morning: at 8:15, the first message arrives, the kettle is already warm, and you have three small tasks to finish before nine. Some details are simple, some are specific, and the sentence lengths change. Read the whole passage clearly, keeping your usual tone and pronunciation.",
  "Now read this passage as if you are presenting a clear idea to another person. Maya noticed that the room sounded different after the window was closed, while Daniel preferred the softer background noise outside. They compared notes, waited for a quiet moment, and then started again. The point is simple: small changes in pace, emphasis, and phrasing should still sound like the same natural speaker.",
  "For the next take, keep your delivery conversational and let the punctuation guide your rhythm. What happens when a sentence asks a question? What changes when an important phrase needs a little emphasis? Try this naturally: \"That sounds useful, but is it really necessary?\" Then continue without forcing the emotion. A calm explanation, a quick question, and a longer sentence should all remain recognizably in your voice.",
  "This passage introduces technical words and numbers without asking you to change your speaking style. A reliable system may process 24-hour schedules, 3 separate files, and more than 120 short notes before the final result is ready. Read names, numbers, and ordinary words exactly as written. Focus on clarity, consistent volume, and clean pronunciation, especially at the beginning and end of each sentence.",
  "This final passage is deliberately varied, so finish with the same relaxed voice you used at the start. Some ideas deserve a little more space; others can move quickly. When the plan is ready, pause, take a breath, and continue: the goal is not perfect acting, but a voice that feels clear, familiar, and consistent from one sentence to the next. Thank you for recording these samples."
];

const ENGINE_OPTIONS = [
  { value: "qwen3-tts-0.6b", label: "Qwen3-TTS 0.6B" },
  { value: "chatterbox-nano", label: "Chatterbox-Nano" }
];

const ENGINE_DESCRIPTIONS = {
  "qwen3-tts-0.6b": "GPU-powered cloning on the Helix TTS worker.",
  "chatterbox-nano": "A lightweight alternative for voice-profile generation."
};

const VOICE_PREVIEW_TEXT = "Hello, this is a sample preview of my Helix narrator voice. The same saved voice profile can now read narration naturally and consistently.";

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

function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function base64ToBlob(value, mimeType = "audio/wav") {
  const raw = String(value || "");
  const encoded = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function profileStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "processing") return "Creating…";
  if (status === "failed") return "Needs attention";
  return "In progress";
}

function firstPendingIndex(profile, prompts) {
  const saved = new Set((profile?.samples || []).map((sample) => Number(sample.sampleIndex)));
  return prompts.findIndex((_, index) => !saved.has(index));
}

export default function VoiceProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [prompts, setPrompts] = useState(FALLBACK_PROMPTS);
  const [minSamples, setMinSamples] = useState(2);
  const [maxSamples, setMaxSamples] = useState(6);
  const [name, setName] = useState("");
  const [engine, setEngine] = useState("qwen3-tts-0.6b");
  const [consent, setConsent] = useState(false);
  const [active, setActive] = useState(null);
  const [stage, setStage] = useState("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draftRecording, setDraftRecording] = useState(null);
  const [playingSample, setPlayingSample] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [savingSample, setSavingSample] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [detailProfile, setDetailProfile] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);
  const [previewPlaying, setPreviewPlaying] = useState(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const cancelNextStopRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef(null);
  const playbackRef = useRef(null);
  const previewUrlsRef = useRef(new Map());
  const studioRef = useRef(null);

  async function loadProfiles() {
    try {
      const response = await fetch("/api/voice-profiles", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load voice profiles.");
      setProfiles(data.profiles || []);
      setPrompts(data.prompts?.length ? data.prompts : FALLBACK_PROMPTS);
      setMinSamples(Number(data.minSamples || 2));
      setMaxSamples(Number(data.maxSamples || 6));
    } catch (err) {
      setError(err.message || "Failed to load voice profiles.");
    }
  }

  useEffect(() => {
    void loadProfiles();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      window.clearInterval(recordingTimerRef.current);
      if (draftRecording?.url) URL.revokeObjectURL(draftRecording.url);
      playbackRef.current?.pause();
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!active?.id) return undefined;
    const timer = window.setTimeout(() => {
      studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [active?.id, stage]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function clearRecordingTimer() {
    window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  function releaseDraftRecording() {
    if (draftRecording?.url) URL.revokeObjectURL(draftRecording.url);
    setDraftRecording(null);
  }

  async function createProfile() {
    const trimmedName = name.trim();
    setError("");
    setMessage("");
    if (!trimmedName) {
      setError("Give your voice profile a name before creating the recording session.");
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
      setActive(data);
      setProfiles((current) => [data, ...current]);
      setName("");
      setConsent(false);
      setCurrentIndex(0);
      setStage("recording");
      setMessage("Session ready. Read the passage below in your normal voice.");
    } catch (err) {
      setError(err.message || "Failed to create voice profile.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRecording(sampleIndex, blob, mimeType) {
    if (!active) return null;
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
      return data.profile;
    } catch (err) {
      setError(err.message || "Failed to save recording.");
      return null;
    } finally {
      setSavingSample(null);
    }
  }

  async function startRecording() {
    if (recording || savingSample !== null || !active || stage !== "recording") return;
    setError("");
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support microphone recording. Use a current Chrome or Edge browser.");
      return;
    }
    try {
      const mimeType = chooseMimeType();
      if (!mimeType) throw new Error("No supported audio recording format was found.");
      releaseDraftRecording();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelNextStopRef.current = false;
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        clearRecordingTimer();
        stopStream();
        setRecording(false);
        setError("Microphone recording failed.");
      };
      recorder.onstop = () => {
        clearRecordingTimer();
        stopStream();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (cancelNextStopRef.current) {
          cancelNextStopRef.current = false;
          return;
        }
        if (!blob.size) {
          setError("No audio was captured. Please try recording again.");
          return;
        }
        setDraftRecording({
          blob,
          url: URL.createObjectURL(blob),
          mimeType,
          durationSeconds: Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000))
        });
        setMessage("Take recorded. Listen once, then keep it or retake it.");
      };
      recorder.start(250);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)));
      }, 250);
    } catch (err) {
      clearRecordingTimer();
      stopStream();
      setRecording(false);
      setError(err.message || "Microphone access failed.");
    }
  }

  function stopRecording() {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
  }

  function cancelCurrentTake() {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    cancelNextStopRef.current = true;
    recorderRef.current.stop();
    setMessage("Take cancelled. Nothing was saved.");
  }

  async function keepDraftAndContinue() {
    if (!draftRecording || savingSample !== null || !active) return;
    const savedProfile = await saveRecording(currentIndex, draftRecording.blob, draftRecording.mimeType);
    if (!savedProfile) return;
    releaseDraftRecording();
    const nextIndex = currentIndex + 1;
    if (nextIndex >= prompts.length || nextIndex >= maxSamples) {
      setStage("review");
      setMessage("All guided passages are complete. Review your tracks before cloning.");
      return;
    }
    setCurrentIndex(nextIndex);
    setStage("recording");
    setMessage("Good. Next passage is ready.");
  }

  function retakeCurrent() {
    releaseDraftRecording();
    setMessage("Retake the current passage when you're ready.");
    setError("");
  }

  function skipCurrent() {
    const savedCount = Number(active?.sampleCount || 0);
    if (savedCount < minSamples) {
      setError("Complete at least " + minSamples + " recordings before skipping a passage.");
      return;
    }
    releaseDraftRecording();
    const nextIndex = currentIndex + 1;
    if (nextIndex >= prompts.length || nextIndex >= maxSamples) {
      setStage("review");
      setMessage("Recording session finished. Review your tracks before cloning.");
      return;
    }
    setCurrentIndex(nextIndex);
    setMessage("Passage skipped. The next one is ready.");
  }

  function finishRecording() {
    if (recording || savingSample !== null || !active) return;
    if (Number(active.sampleCount || 0) < minSamples) {
      setError("Complete at least " + minSamples + " recordings before finishing.");
      return;
    }
    if (draftRecording) return;
    setStage("review");
    setMessage("Review your recordings before creating the clone.");
  }

  function stopPlayback() {
    const audio = playbackRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      playbackRef.current = null;
    }
    setPlayingSample(null);
    setPreviewPlaying(null);
  }

  function openProfile(profile) {
    stopPlayback();
    setDetailProfile(profile);
    setError("");
  }

  function continueProfile(profile) {
    setDetailProfile(null);
    setActive(profile);
    setEngine(profile.preferredEngine || "qwen3-tts-0.6b");
    const pending = firstPendingIndex(profile, prompts);
    if (profile.status === "ready" || pending < 0) {
      setStage("review");
      setCurrentIndex(Math.max(0, prompts.length - 1));
    } else {
      setCurrentIndex(pending);
      setStage("recording");
    }
    setMessage("");
    setError("");
  }

  function closeDetail() {
    stopPlayback();
    setDetailProfile(null);
  }

  function reviewAgain(index) {
    releaseDraftRecording();
    setCurrentIndex(index);
    setStage("recording");
    setMessage("Retake passage " + (index + 1) + " to replace the saved track.");
    setError("");
  }

  async function playSample(sample) {
    const sampleId = sample.id || ("local-" + sample.sampleIndex);
    if (playingSample === sampleId) {
      stopPlayback();
      return;
    }

    stopPlayback();
    try {
      let blobUrl = null;
      let shouldRevoke = false;
      if (sample.audioUrl) {
        const response = await fetch(sample.audioUrl, { credentials: "include" });
        if (!response.ok) throw new Error("Recording could not be loaded.");
        blobUrl = URL.createObjectURL(await response.blob());
        shouldRevoke = true;
      } else if (draftRecording) {
        blobUrl = draftRecording.url;
      }
      if (!blobUrl) return;

      const audio = new Audio(blobUrl);
      playbackRef.current = audio;
      setPlayingSample(sampleId);
      audio.onended = () => {
        if (playbackRef.current === audio) {
          playbackRef.current = null;
          setPlayingSample(null);
        }
        if (shouldRevoke) URL.revokeObjectURL(blobUrl);
      };
      audio.onerror = () => {
        if (playbackRef.current === audio) {
          playbackRef.current = null;
          setPlayingSample(null);
        }
        if (shouldRevoke) URL.revokeObjectURL(blobUrl);
      };
      await audio.play();
    } catch (err) {
      if (playbackRef.current) stopPlayback();
      setError(err.message || "Recording playback failed.");
    }
  }

  async function playVoicePreview(profile) {
    if (!profile?.id || profile.status !== "ready" || !profile.ttsVoiceId) return;
    if (previewPlaying === profile.id) {
      stopPlayback();
      return;
    }

    stopPlayback();
    try {
      setPreviewLoading(profile.id);
      setError("");

      let blobUrl = previewUrlsRef.current.get(profile.id);
      if (!blobUrl) {
        const response = await fetch("/api/voice-profiles/" + profile.id + "/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: VOICE_PREVIEW_TEXT })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to generate cloned voice preview.");
        blobUrl = URL.createObjectURL(base64ToBlob(data.audioBase64, data.mimeType || "audio/wav"));
        previewUrlsRef.current.set(profile.id, blobUrl);
      }

      const audio = new Audio(blobUrl);
      audio.preload = "auto";
      playbackRef.current = audio;
      setPreviewPlaying(profile.id);
      audio.onended = () => {
        if (playbackRef.current === audio) {
          playbackRef.current = null;
          setPreviewPlaying(null);
        }
      };
      audio.onerror = () => {
        if (playbackRef.current === audio) {
          playbackRef.current = null;
          setPreviewPlaying(null);
        }
        setError("Cloned voice preview could not be played.");
      };
      await audio.play();
    } catch (err) {
      if (playbackRef.current) stopPlayback();
      setError(err.message || "Failed to generate cloned voice preview.");
    } finally {
      setPreviewLoading(null);
    }
  }

  async function cloneProfile() {
    if (!active || Number(active.sampleCount || 0) < minSamples || busy) return;
    setBusy(true);
    setError("");
    setMessage("Cleaning and combining your recordings, then creating the cloned voice…");
    try {
      const response = await fetch("/api/voice-profiles/" + active.id + "/clone", {
        method: "POST",
        credentials: "include"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create voice clone.");
      setProfiles((current) => current.map((profile) => profile.id === data.profile.id ? data.profile : profile));
      releaseDraftRecording();
      stopStream();
      setActive(null);
      setStage("setup");
      setCurrentIndex(0);
      setName("");
      setConsent(false);
      setEngine("qwen3-tts-0.6b");
      setMessage("Voice profile is ready for narration. It has been saved to Your Library.");
      setError("");
    } catch (err) {
      setError(err.message || "Failed to create voice clone.");
      await loadProfiles();
    } finally {
      setBusy(false);
    }
  }

  function requestDelete(profile) {
    if (!busy) setDeleteTarget(profile);
  }

  async function deleteProfile() {
    const profile = deleteTarget;
    if (!profile || busy) return;
    setDeleteTarget(null);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/voice-profiles/" + profile.id, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete voice profile.");
      }
      if (active?.id === profile.id) {
        setActive(null);
        setStage("setup");
        releaseDraftRecording();
      }
      if (detailProfile?.id === profile.id) setDetailProfile(null);
      const previewUrl = previewUrlsRef.current.get(profile.id);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrlsRef.current.delete(profile.id);
      }
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      setMessage("Voice profile deleted.");
    } catch (err) {
      setError(err.message || "Failed to delete voice profile.");
    } finally {
      setBusy(false);
    }
  }

  function leaveSession() {
    if (recording) {
      cancelCurrentTake();
      return;
    }
    releaseDraftRecording();
    setActive(null);
    setStage("setup");
    setMessage("");
    setError("");
  }

  const savedCount = Number(active?.sampleCount || 0);
  const ready = active?.status === "ready";
  const currentPrompt = prompts[currentIndex] || FALLBACK_PROMPTS[0];
  const studioProgress = stage === "review" ? 100 : Math.min(100, Math.round(((currentIndex + 1) / Math.max(maxSamples, 1)) * 100));
  const hasCurrentSaved = Boolean(active?.samples?.some((sample) => Number(sample.sampleIndex) === currentIndex));
  const canSkip = savedCount >= minSamples;

  return (
    <div className="hx-page voice-profiles-page">
      <Header right={<Link to="/my-research" className="btn btn-ghost">My Research</Link>} />
      <main className="container voice-profiles-page__main">
        <section className="voice-profiles-page__hero">
          <div className="voice-profiles-page__hero-copy">
            <p className="eyebrow">Voice Profiles</p>
            <h1>Create your narrator voice.</h1>
            <p>Record a few guided passages one at a time. Helix keeps the original tracks, prepares a clean reference, and saves the finished clone as a reusable voice profile.</p>
          </div>
          <div className="voice-profiles-page__hero-note">
            <strong>{minSamples} recordings minimum</strong>
            <span>More passages are optional.</span>
          </div>
        </section>

        {error && <div className="voice-profiles-page__alert" role="alert">{error}</div>}
        {message && <div className="voice-profiles-page__success" role="status">{message}</div>}

        {!active ? (
          <section className="voice-profiles-page__card voice-profiles-page__setup">
            <div className="voice-profiles-page__card-head">
              <div><span className="eyebrow">New voice</span><h2>Start a guided recording.</h2><p>You will see one passage at a time. Record it, listen back, then keep it or retake it.</p></div>
              <span className="voice-profiles-page__badge">2–6 passages</span>
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
              <span>One passage at a time · you can stop or retake any take.</span>
            </div>
          </section>
        ) : (
          <section ref={studioRef} className="voice-profiles-page__card voice-profiles-page__studio">
            <div className="voice-profiles-page__studio-header">
              <div>
                <span className="eyebrow">{ready ? "Voice profile ready" : stage === "review" ? "Review recordings" : "Recording studio"}</span>
                <h2>{active.name}</h2>
                <p>{ready ? "This cloned voice is ready for Storyboard narration." : "Speak naturally. Keep the microphone in the same position for every passage."}</p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={leaveSession} disabled={busy}>{recording ? "Cancel take" : "Leave session"}</button>
            </div>

            <div className="voice-profiles-page__studio-summary">
              <div className="voice-profiles-page__studio-progress">
                <div className="voice-profiles-page__progress-label"><span>{stage === "review" ? "Recording complete" : "Passage " + Math.min(currentIndex + 1, maxSamples) + " of " + maxSamples}</span><strong>{savedCount} saved</strong></div>
                <div className="voice-profiles-page__progress"><span style={{ width: studioProgress + "%" }} /></div>
              </div>
              <span className="voice-profiles-page__studio-engine">{engine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano"}</span>
            </div>

            {!ready && stage === "recording" && (
              <div className="voice-profiles-page__take">
                <div className="voice-profiles-page__take-top">
                  <div>
                    <span className="mono-label">READ THIS ALOUD</span>
                    <p>{currentPrompt}</p>
                  </div>
                  <span className="voice-profiles-page__take-number">{String(currentIndex + 1).padStart(2, "0")}</span>
                </div>

                <div className={"voice-profiles-page__recorder " + (recording ? "is-recording" : draftRecording ? "has-take" : "")}>
                  <div className="voice-profiles-page__recorder-status">
                    <span className="voice-profiles-page__recorder-dot" aria-hidden="true" />
                    <strong>{recording ? "Recording" : draftRecording ? "Take ready" : hasCurrentSaved ? "Saved take" : "Ready to record"}</strong>
                    <span>{recording ? formatTime(recordingSeconds) : draftRecording ? formatTime(draftRecording.durationSeconds) : "Speak at your normal pace"}</span>
                  </div>

                  {draftRecording && <audio className="voice-profiles-page__native-audio" controls src={draftRecording.url} aria-label={"Preview of passage " + (currentIndex + 1)} />}

                  <div className="voice-profiles-page__recorder-actions">
                    {!recording && !draftRecording && <button type="button" className="btn btn-cream voice-profiles-page__primary-record" onClick={startRecording} disabled={savingSample !== null || busy}><span className="voice-profiles-page__mic-dot" aria-hidden="true">●</span> Record passage</button>}
                    {recording && <><button type="button" className="btn btn-cream voice-profiles-page__primary-record" onClick={stopRecording}>Stop recording</button><button type="button" className="btn btn-ghost" onClick={cancelCurrentTake}>Cancel take</button></>}
                    {draftRecording && <><button type="button" className="btn btn-cream" onClick={keepDraftAndContinue} disabled={savingSample !== null}>{savingSample !== null ? "Saving…" : currentIndex + 1 >= maxSamples ? "Keep & review" : "Keep & next passage →"}</button><button type="button" className="btn btn-ghost" onClick={retakeCurrent} disabled={savingSample !== null}>Retake</button></>}
                  </div>
                </div>

                <div className="voice-profiles-page__take-footer">
                  <span>{hasCurrentSaved ? "A saved track already exists for this passage. Recording again replaces it." : "Clean, consistent audio matters more than acting or perfect delivery."}</span>
                  <div>
                    {canSkip && <button type="button" className="btn btn-link" onClick={skipCurrent} disabled={recording || draftRecording || savingSample !== null || busy}>Skip passage</button>}
                    {canSkip && !draftRecording && <button type="button" className="btn btn-link" onClick={finishRecording} disabled={recording || savingSample !== null || busy}>Finish &amp; review</button>}
                  </div>
                </div>
              </div>
            )}

            {!ready && stage === "review" && (
              <div className="voice-profiles-page__review">
                <div className="voice-profiles-page__review-head">
                  <div><span className="mono-label">YOUR RECORDING TRACKS</span><h3>Review before cloning.</h3><p>{savedCount} tracks will be cleaned, combined, and sent to the selected cloning engine.</p></div>
                  {canSkip && <span className="voice-profiles-page__review-count">{savedCount} saved</span>}
                </div>
                <div className="voice-profiles-page__track-list">
                  {(active.samples || []).map((sample) => (
                    <div className="voice-profiles-page__track" key={sample.id}>
                      <span className="voice-profiles-page__track-index">{String(Number(sample.sampleIndex) + 1).padStart(2, "0")}</span>
                      <div className="voice-profiles-page__track-copy"><strong>Passage {Number(sample.sampleIndex) + 1}</strong><span>{formatBytes(sample.sizeBytes)} · Saved track</span></div>
                      <button type="button" className="btn btn-ghost" onClick={() => playSample(sample)} disabled={busy}>{playingSample === sample.id ? "Playing…" : "Play"}</button>
                      <button type="button" className="btn btn-ghost" onClick={() => reviewAgain(Number(sample.sampleIndex))} disabled={busy}>Retake</button>
                    </div>
                  ))}
                </div>
                <div className="voice-profiles-page__review-actions">
                  <button type="button" className="btn btn-cream" onClick={cloneProfile} disabled={busy || savedCount < minSamples}>
                    {busy ? "Creating voice profile…" : "Clean tracks & create voice profile"} <span aria-hidden="true">→</span>
                  </button>
                  <span>Original recordings stay saved with this profile. Only the prepared reference is temporary during cloning.</span>
                </div>
              </div>
            )}

            {ready && (
              <div className="voice-profiles-page__ready-panel">
                <div className="voice-profiles-page__ready-icon">✓</div>
                <div><strong>Ready for narration.</strong><span>Open a project storyboard and select <b>{active.name}</b> under Narration → Saved voice profile.</span></div>
              </div>
            )}
          </section>
        )}

        <section className="voice-profiles-page__library">
          <div className="voice-profiles-page__library-head"><div><p className="eyebrow">Your library</p><h2>Saved voice profiles</h2></div><span>{profiles.length} profile{profiles.length === 1 ? "" : "s"}</span></div>
          {!profiles.length ? <p className="voice-profiles-page__empty">No voice profiles yet. Start one above.</p> : (
            <div className="voice-profiles-page__grid">
              {profiles.map((profile) => (
                <article key={profile.id} className="voice-profiles-page__profile">
                  <div className="voice-profiles-page__profile-top"><span className={"voice-profiles-page__status is-" + profile.status}>{profileStatusLabel(profile.status)}</span><span>{profile.sampleCount} samples</span></div>
                  <h3>{profile.name}</h3>
                  <p>{profile.preferredEngine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano"} · {profile.language}</p>
                  <div className="voice-profiles-page__profile-actions">
                    {profile.status === "ready" && profile.ttsVoiceId && (
                      <button type="button" className="btn btn-ghost voice-profiles-page__profile-play" onClick={() => void playVoicePreview(profile)} disabled={busy || previewLoading === profile.id} title="Play cloned voice preview">
                        {previewLoading === profile.id ? "Generating…" : previewPlaying === profile.id ? "■ Stop" : "▶ Play"}
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost" onClick={() => openProfile(profile)}>Open</button>
                    <button type="button" className="btn btn-ghost" onClick={() => requestDelete(profile)} disabled={busy}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <VoiceProfileDialog
        profile={detailProfile}
        open={Boolean(detailProfile)}
        onClose={closeDetail}
        onContinue={detailProfile && ["draft", "failed"].includes(detailProfile.status) ? () => continueProfile(detailProfile) : undefined}
        onPlaySample={playSample}
        playingSample={playingSample}
        previewLoading={previewLoading}
        previewPlaying={previewPlaying}
        onPlayPreview={playVoicePreview}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? "Delete this voice profile?" : ""}
        message={deleteTarget ? "“" + deleteTarget.name + "” and all of its saved recording tracks will be permanently removed." : ""}
        confirmLabel="Delete voice profile"
        cancelLabel="Keep profile"
        tone="danger"
        onConfirm={deleteProfile}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
