import React from "react";
import { Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clipFrames(clip, fps) {
  return Math.max(1, Math.round(Number(clip.duration || 0.1) * fps));
}

function transitionStyle(clip, frame, fps) {
  const duration = Math.max(0.05, Number(clip.duration || 0.1));
  const time = frame / fps;
  const remaining = duration - time;
  const inTransition = clip.transitionIn || { preset: "none", duration: 0 };
  const outTransition = clip.transitionOut || { preset: "none", duration: 0 };
  const effect = clip.effect || { preset: "none", intensity: 0 };
  const inDuration = Math.min(duration / 2, Math.max(0, Number(inTransition.duration || 0)));
  const outDuration = Math.min(duration / 2, Math.max(0, Number(outTransition.duration || 0)));
  const intensity = clamp(Number(effect.intensity ?? 0), 0, 1);

  let opacity = 1;
  let x = 0;
  let scale = 1;

  if (effect.preset === "slow-zoom-in") scale *= 1 + (0.12 * intensity * clamp(time / duration, 0, 1));
  if (effect.preset === "slow-zoom-out") scale *= 1.12 - (0.12 * intensity * clamp(time / duration, 0, 1));
  if (effect.preset === "pan-left") { scale *= 1 + 0.08 * intensity; x -= 18 * intensity * clamp(time / duration, 0, 1); }
  if (effect.preset === "pan-right") { scale *= 1 + 0.08 * intensity; x += 18 * intensity * clamp(time / duration, 0, 1); }

  if (inTransition.preset !== "none" && inDuration > 0 && time < inDuration) {
    const progress = clamp(time / inDuration, 0, 1);
    if (inTransition.preset === "fade") opacity *= progress;
    if (inTransition.preset === "slide-left") x -= (1 - progress) * 100;
    if (inTransition.preset === "slide-right") x += (1 - progress) * 100;
    if (inTransition.preset === "zoom") scale *= 0.9 + progress * 0.1;
  }

  if (outTransition.preset !== "none" && outDuration > 0 && remaining < outDuration) {
    const progress = clamp(remaining / outDuration, 0, 1);
    if (outTransition.preset === "fade") opacity *= progress;
    if (outTransition.preset === "slide-left") x += (1 - progress) * 100;
    if (outTransition.preset === "slide-right") x -= (1 - progress) * 100;
    if (outTransition.preset === "zoom") scale *= 1 + (1 - progress) * 0.1;
  }

  return {
    transform: `translate3d(${x}%, 0, 0) scale(${scale})`,
    transformOrigin: "center center",
    opacity,
  };
}

function VideoClip({ clip }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = transitionStyle(clip, frame, fps);
  const startFrom = Math.max(0, Math.round(Number(clip.offset || 0) * fps));

  if (!clip.src) return <div style={styles.fallback} />;

  return (
    <OffthreadVideo
      src={clip.src}
      muted
      volume={0}
      startFrom={startFrom}
      style={{ ...styles.media, ...style }}
      playbackRate={1}
    />
  );
}

function AudioClip({ clip }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localSeconds = frame / fps;
  const duration = Math.max(0.05, Number(clip.duration || 0.1));
  const fadeIn = Math.min(duration / 2, Math.max(0, Number(clip.fadeIn || 0)));
  const fadeOut = Math.min(duration / 2, Math.max(0, Number(clip.fadeOut || 0)));
  const base = clamp(Number(clip.volume ?? 1), 0, 1);
  const inGain = fadeIn > 0 ? clamp(localSeconds / fadeIn, 0, 1) : 1;
  const outGain = fadeOut > 0 ? clamp((duration - localSeconds) / fadeOut, 0, 1) : 1;
  const volume = base * Math.min(inGain, outGain);
  const startFrom = Math.max(0, Math.round(Number(clip.offset || 0) * fps));
  const endAt = startFrom + Math.max(1, Math.round(duration * fps));

  if (!clip.src) return null;
  return <Audio src={clip.src} startFrom={startFrom} endAt={endAt} volume={volume} />;
}

function captionStyle(clip) {
  const position = String(clip.position || "lower-middle");
  const style = String(clip.style || "default");
  const emphasis = String(clip.emphasis || "none");
  const top = position === "top" ? 150 : position === "center" ? "42%" : "auto";
  const bottom = position === "lower-middle" ? 300 : position === "bottom" ? 120 : "auto";
  const highlight = style === "highlight";
  const minimal = style === "minimal";
  const bold = style === "bold" || emphasis === "all";
  return {
    left: 70,
    right: 70,
    top,
    bottom,
    padding: highlight ? "10px 18px" : 0,
    borderRadius: highlight ? 10 : 0,
    fontSize: minimal ? 44 : 58,
    lineHeight: 1.08,
    textAlign: "center",
    fontWeight: bold ? 900 : 700,
    color: highlight ? "#080808" : "white",
    background: highlight ? "rgba(255,255,255,.88)" : "transparent",
    textShadow: minimal || highlight ? "none" : "0 4px 24px rgba(0,0,0,.65)",
  };
}

function CaptionClip({ clip }) {
  return <div style={{ ...styles.caption, ...captionStyle(clip) }}>{clip.text || ""}</div>;
}

function OverlayClip({ clip }) {
  const position = String(clip.position || "center");
  const style = position === "top" ? { top: 120 } : position === "bottom" ? { bottom: 120 } : { top: "48%" };
  return <div style={{ ...styles.overlay, ...style }}>{clip.text || ""}</div>;
}

function TrackClips({ track, fps, renderClip }) {
  return (track?.clips || []).map((clip) => (
    <Sequence key={clip.id} from={Math.max(0, Math.round(Number(clip.start || 0) * fps))} durationInFrames={clipFrames(clip, fps)}>
      {renderClip(clip)}
    </Sequence>
  ));
}

export function HelixEditorComposition({ timeline }) {
  const { fps } = useVideoConfig();
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  const videoTrack = tracks.find((track) => track.id === "video" || track.kind === "video");
  const audioTracks = tracks.filter((track) => track.kind === "audio" && !track.muted);
  const captionTracks = tracks.filter((track) => track.kind === "caption" && !track.muted);
  const overlayTracks = tracks.filter((track) => track.kind === "overlay" && !track.muted);

  return (
    <div style={styles.root}>
      {videoTrack && <TrackClips track={videoTrack} fps={fps} renderClip={(clip) => <VideoClip clip={clip} />} />}
      {audioTracks.flatMap((track) => (track.clips || []).map((clip) => (
        <Sequence key={`audio-${clip.id}`} from={Math.max(0, Math.round(Number(clip.start || 0) * fps))} durationInFrames={clipFrames(clip, fps)}>
          <AudioClip clip={clip} />
        </Sequence>
      )))}
      {captionTracks.flatMap((track) => (track.clips || []).map((clip) => (
        <Sequence key={`caption-${clip.id}`} from={Math.max(0, Math.round(Number(clip.start || 0) * fps))} durationInFrames={clipFrames(clip, fps)}>
          <CaptionClip clip={clip} />
        </Sequence>
      )))}
      {overlayTracks.flatMap((track) => (track.clips || []).map((clip) => (
        <Sequence key={`overlay-${clip.id}`} from={Math.max(0, Math.round(Number(clip.start || 0) * fps))} durationInFrames={clipFrames(clip, fps)}>
          <OverlayClip clip={clip} />
        </Sequence>
      )))}
    </div>
  );
}

export function editorCompositionMetadata({ props }) {
  const duration = Math.max(0.1, Number(props?.timeline?.duration || 0.1));
  const fps = Math.max(1, Math.round(Number(props?.timeline?.fps || 30)));
  return {
    durationInFrames: Math.max(1, Math.ceil(duration * fps)),
    fps,
    width: 1080,
    height: 1920,
  };
}

const styles = {
  root: { position: "relative", width: 1080, height: 1920, background: "#080808", overflow: "hidden" },
  media: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  fallback: { position: "absolute", inset: 0, background: "linear-gradient(145deg, #172333, #080b10)" },
  caption: { position: "absolute", zIndex: 10 },
  overlay: { position: "absolute", zIndex: 20, left: 70, right: 70, fontSize: 64, lineHeight: 1.05, textAlign: "center", fontWeight: 800, color: "white", textShadow: "0 4px 22px rgba(0,0,0,.65)" },
};
