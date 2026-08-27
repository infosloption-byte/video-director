import { useEffect, useMemo, useRef, useState } from "react";
import { IconPlay, IconPause } from "./Icons";
import "./PhonePreview.css";

function formatTime(value) {
  const seconds = Math.max(0, Number(value || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function PhonePreview({ step, duration, cuts, playing, onTogglePlay }) {
  const audioRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  const hasAudio = Boolean(step?.audioUrl);
  const timestamps = useMemo(() => (
    Array.isArray(step?.wordTimestamps) ? step.wordTimestamps : []
  ), [step?.wordTimestamps]);

  useEffect(() => {
    setCurrentTime(0);
    setAudioDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      if (step?.audioUrl) audioRef.current.load();
    }
  }, [step?.id, step?.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !hasAudio) return;

    if (playing) {
      audio.play().catch(() => onTogglePlay?.());
    } else {
      audio.pause();
    }
  }, [playing, hasAudio, step?.id, onTogglePlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !hasAudio) return undefined;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setAudioDuration(audio.duration || 0);
    const handleEnded = () => {
      setCurrentTime(audio.duration || 0);
      onTogglePlay?.();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [hasAudio, step?.id, onTogglePlay]);

  if (!step) {
    return <div className="hx-preview"><div className="hx-preview__frame hx-preview__frame--empty"><span className="eyebrow">Storyboard preview</span><strong>Waiting for the first scene…</strong></div></div>;
  }

  const words = String(step.line || "").split(/\s+/).filter(Boolean);
  const fallbackWords = words.slice(0, 4);
  const background = step.selectedAsset?.thumbnailUrl ? `url(${step.selectedAsset.thumbnailUrl}) center / cover no-repeat` : step.thumb;
  const displayDuration = hasAudio && audioDuration ? audioDuration : Number(step.durationSeconds || duration || 0);
  const progress = displayDuration ? Math.min(100, (currentTime / displayDuration) * 100) : 0;

  return (
    <div className="hx-preview">
      <div className="hx-preview__frame" style={{ background }}>
        {step.thumbLabel && (
          <div className="hx-preview__altbadge">
            <span className="hx-preview__altdot" aria-hidden="true" />
            {step.thumbLabel}
          </div>
        )}

        <div className="hx-preview__scrim" />

        <div className="hx-preview__captions">
          <p className="hx-preview__caption-lead">{step.title}</p>
          <p className="hx-preview__caption-sub" aria-live="polite">
            {timestamps.length > 0 ? timestamps.map((item, index) => {
              const isSaid = currentTime >= Number(item.end || 0);
              const isCurrent = currentTime >= Number(item.start || 0) && currentTime < Number(item.end || 0);
              return (
                <span key={`${item.word}-${index}`} className={isCurrent ? "is-current" : isSaid ? "is-said" : "is-pending"}>
                  {item.word}{index < timestamps.length - 1 ? " " : ""}
                </span>
              );
            }) : fallbackWords.map((word, index) => (
              <span key={`${word}-${index}`} className={index === 0 && playing ? "is-said" : "is-pending"}>
                {word}{index < fallbackWords.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        </div>

        <div className="hx-preview__controls">
          <button className="hx-preview__play" onClick={onTogglePlay} aria-label={playing ? "Pause preview" : "Play preview"}>
            {playing ? <IconPause /> : <IconPlay style={{ marginLeft: 2 }} />}
          </button>
          <div className="hx-preview__scrub" aria-hidden="true">
            <div className="hx-preview__track"><div className="hx-preview__fill" style={{ width: `${progress}%` }} /></div>
          </div>
          <span className="mono-label hx-preview__time">{formatTime(currentTime)} / {formatTime(displayDuration)}</span>
        </div>

        {hasAudio && <audio ref={audioRef} src={step.audioUrl} preload="metadata" />}
      </div>
      <p className="hx-preview__note">9:16 safe zone · captions upper-middle · {cuts} cuts{hasAudio ? " · synced narration" : ""}</p>
    </div>
  );
}
