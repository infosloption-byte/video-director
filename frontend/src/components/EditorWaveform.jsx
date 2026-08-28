import { useEffect, useRef, useState } from "react";

const waveformCache = new Map();
let audioContext = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioContext = new AudioContext();
  }
  return audioContext;
}

function buildPeaks(buffer, samples = 96) {
  const channelCount = Math.max(1, buffer.numberOfChannels);
  const frameCount = buffer.length;
  const bucketSize = Math.max(1, Math.floor(frameCount / samples));
  const peaks = [];

  for (let bucket = 0; bucket < samples; bucket += 1) {
    const start = bucket * bucketSize;
    const end = Math.min(frameCount, start + bucketSize);
    if (start >= end) {
      peaks.push(0);
      continue;
    }

    let peak = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(data[index]));
      }
    }
    peaks.push(peak);
  }

  const max = Math.max(...peaks, 0.001);
  return peaks.map((value) => value / max);
}

export default function EditorWaveform({ src, progress = 0, className = "" }) {
  const canvasRef = useRef(null);
  const [peaks, setPeaks] = useState(() => (src ? waveformCache.get(src) || null : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    if (!src) {
      setPeaks(null);
      return undefined;
    }

    const cached = waveformCache.get(src);
    if (cached) {
      setPeaks(cached);
      return undefined;
    }

    const load = async () => {
      try {
        const response = await fetch(src, { credentials: "include", cache: "force-cache" });
        if (!response.ok) throw new Error(`Waveform request failed with ${response.status}`);
        const data = await response.arrayBuffer();
        const context = getAudioContext();
        if (!context) throw new Error("Web Audio is unavailable.");
        const buffer = await context.decodeAudioData(data.slice(0));
        if (cancelled) return;
        const next = buildPeaks(buffer);
        waveformCache.set(src, next);
        setPeaks(next);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "currentColor";

      const values = peaks?.length ? peaks : Array.from({ length: 72 }, (_, index) => 0.2 + ((index * 17) % 53) / 100);
      const barWidth = width / values.length;
      const mid = height / 2;
      const fadeProgress = Math.max(0, Math.min(1, Number(progress) || 0));

      values.forEach((value, index) => {
        const amplitude = Math.max(1, value * height * 0.9);
        const x = index * barWidth;
        const gap = Math.max(1, barWidth * 0.25);
        const h = Math.max(1, amplitude - gap);
        context.globalAlpha = index / values.length <= fadeProgress ? 0.95 : 0.45;
        context.fillRect(x, mid - h / 2, Math.max(1, barWidth - gap), h);
      });
      context.globalAlpha = 1;
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, progress]);

  if (failed) return <span className={`editor-clip__wave-fallback ${className}`}>Audio waveform unavailable</span>;
  return <canvas ref={canvasRef} className={`editor-clip__wave ${className}`} aria-label="Audio waveform" />;
}
