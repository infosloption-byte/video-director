import React from "react";
import { Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";

function sceneDurationFrames(scene, fps) {
  return Math.max(1, Math.round(Number(scene.durationSeconds || 1) * fps));
}

function scaledTimestamps(scene) {
  const scale = Number(scene.timestampScale || 1);
  return (Array.isArray(scene.wordTimestamps) ? scene.wordTimestamps : []).map((item) => ({
    ...item,
    start: Number(item.start || 0) * scale,
    end: Number(item.end || 0) * scale,
  }));
}

function Caption({ scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = frame / fps;
  const timestamps = scaledTimestamps(scene);

  if (!timestamps.length) return <div style={styles.caption}>{scene.spokenText}</div>;

  const visibleWords = timestamps.filter((item) => elapsed >= item.start);
  const currentIndex = timestamps.findIndex((item) => elapsed >= item.start && elapsed < item.end);

  return (
    <div style={styles.caption}>
      {timestamps.map((item, index) => (
        <span key={`${item.word}-${index}`} style={{
          opacity: index <= currentIndex || (currentIndex < 0 && visibleWords.length) ? 1 : 0.78,
          fontWeight: index === currentIndex ? 800 : 700,
        }}>
          {item.word}{index < timestamps.length - 1 ? " " : ""}
        </span>
      ))}
    </div>
  );
}

function Scene({ scene }) {
  const { fps } = useVideoConfig();
  const duration = sceneDurationFrames(scene, fps);
  const selectedAsset = scene.selectedAsset || scene.assets?.find((asset) => asset.isSelected) || scene.assets?.[0];

  return (
    <div style={styles.scene}>
      {selectedAsset?.videoUrl ? (
        <OffthreadVideo
          src={selectedAsset.videoUrl}
          muted
          volume={0}
          style={styles.video}
          playbackRate={1}
        />
      ) : selectedAsset?.thumbnailUrl ? (
        <img src={selectedAsset.thumbnailUrl} alt="" style={styles.video} />
      ) : (
        <div style={styles.fallback} />
      )}
      <div style={styles.scrim} />
      <div style={styles.sceneNumber}>{String(scene.sceneOrder).padStart(2, "0")}</div>
      <Caption scene={scene} />
      {scene.audioUrl && <Audio src={scene.audioUrl} volume={1} playbackRate={scene.playbackRate || 1} />}
      <div style={styles.brand}>HELIX</div>
      <div style={styles.duration}>{Math.round((duration / fps) * 10) / 10}s</div>
    </div>
  );
}

export function HelixComposition({ scenes = [] }) {
  const { fps } = useVideoConfig();
  let from = 0;

  return (
    <div style={styles.root}>
      {scenes.map((scene) => {
        const duration = sceneDurationFrames(scene, fps);
        const start = from;
        from += duration;
        return <Sequence key={scene.id || scene.sceneOrder} from={start} durationInFrames={duration}><Scene scene={scene} /></Sequence>;
      })}
    </div>
  );
}

export const compositionMetadata = ({ props }) => ({
  durationInFrames: Math.max(1, Math.ceil((props.scenes || []).reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0) * 30)),
  fps: 30,
  width: 1080,
  height: 1920,
});

const styles = {
  root: { width: 1080, height: 1920, background: "#080808", overflow: "hidden" },
  scene: { position: "relative", width: 1080, height: 1920, overflow: "hidden", background: "#080808", color: "white", fontFamily: "Arial, Helvetica, sans-serif" },
  video: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  fallback: { position: "absolute", inset: 0, background: "linear-gradient(145deg, #172333, #080b10)" },
  scrim: { position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.18) 0%, rgba(0,0,0,.05) 35%, rgba(0,0,0,.72) 100%)" },
  sceneNumber: { position: "absolute", top: 64, left: 60, fontSize: 24, letterSpacing: 4, opacity: .78 },
  caption: { position: "absolute", left: 70, right: 70, bottom: 330, fontSize: 64, lineHeight: 1.08, textAlign: "center", textShadow: "0 4px 24px rgba(0,0,0,.65)" },
  brand: { position: "absolute", top: 66, right: 60, fontSize: 22, letterSpacing: 5, fontWeight: 700 },
  duration: { position: "absolute", left: 60, bottom: 72, fontSize: 20, opacity: .75 },
};
