import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Voiceover } from "@/lib/types";
import { formatClock } from "@/lib/utils";
import { fullScript, projectDuration } from "@/lib/reach";
import { activeWordIndex, estimateWordTimings } from "@/lib/timings";
import { cn } from "@/lib/utils";

export function ReelPlayer({
  project,
  voiceover,
  className,
}: {
  project: Project;
  voiceover?: Voiceover | null;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const fallbackDuration = projectDuration(project);
  const duration = voiceover?.duration || fallbackDuration;
  const script = fullScript(project);
  const words = useMemo(
    () => voiceover?.words?.length ? voiceover.words : estimateWordTimings(script, 1.1),
    [voiceover, script],
  );

  const scene = useMemo(() => {
    let acc = 0;
    for (const s of project.scenes) {
      if (time < acc + s.durationSeconds) return s;
      acc += s.durationSeconds;
    }
    return project.scenes[project.scenes.length - 1];
  }, [project.scenes, time]);

  const visual = scene?.visuals[scene.selectedIndex] ?? scene?.visuals[0];
  const wordIndex = activeWordIndex(words, time);
  const captionWindow = words.slice(
    Math.max(0, wordIndex - 2),
    Math.min(words.length, wordIndex + 4),
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setTime(audio.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, [voiceover?.audioUrl]);

  useEffect(() => {
    if (voiceover?.audioUrl) return;
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= duration) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, voiceover?.audioUrl, duration]);

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [project.id, voiceover?.audioUrl]);

  function toggle() {
    const audio = audioRef.current;
    if (audio && voiceover?.audioUrl) {
      if (playing) {
        audio.pause();
        setPlaying(false);
      } else {
        void audio.play();
        setPlaying(true);
      }
      return;
    }
    setPlaying((p) => !p);
  }

  const progress = duration > 0 ? Math.min(1, time / duration) : 0;
  const ken = (scene?.sceneOrder ?? 1) % 2 === 0 ? "kenburns-b" : "kenburns-a";

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      {voiceover?.audioUrl ? (
        <audio ref={audioRef} src={voiceover.audioUrl} preload="auto" />
      ) : null}
      <div className="w-full max-w-[320px] rounded-2xl bg-elevated p-2 shadow-[var(--shadow-border),var(--shadow-float)]">
        <div className="relative aspect-reel overflow-hidden rounded-xl bg-bg">
          {visual ? (
            <img
              key={`${visual.id}-${scene?.sceneOrder}`}
              src={visual.url}
              alt={visual.alt}
              className={cn(
                "absolute inset-0 h-full w-full object-cover",
                playing ? ken : "",
              )}
              style={{ background: visual.color }}
            />
          ) : (
            <div className="absolute inset-0 bg-elevated" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/10 to-bg/80" />

          <div className="absolute top-[11%] right-4 left-4 text-center">
            <p
              key={scene?.onScreenText}
              className="caption-in font-display text-[1.65rem] leading-tight tracking-tight text-fg"
            >
              {scene?.onScreenText}
            </p>
          </div>

          <div className="absolute right-3 bottom-[22%] left-3 text-center">
            <p className="text-[0.95rem] leading-snug font-medium">
              {captionWindow.map((w, i) => {
                const global = Math.max(0, wordIndex - 2) + i;
                const on = global === wordIndex;
                return (
                  <span
                    key={`${w.word}-${global}`}
                    className={cn(
                      "mr-1 inline-block",
                      on ? "text-fg" : "text-fg/45",
                    )}
                  >
                    {w.word}
                  </span>
                );
              })}
            </p>
          </div>

          <div className="absolute right-3 bottom-3 left-3 flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-fg"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4 ml-0.5" />
              )}
            </button>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-fg/15">
              <div
                className="h-full bg-accent"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-muted tabular-nums">
              {formatClock(time)} / {formatClock(duration)}
            </span>
          </div>
        </div>
      </div>
      <p className="max-w-[320px] text-center text-xs text-subtle">
        9:16 safe zone · captions upper-middle · {project.scenes.length} cuts
      </p>
    </div>
  );
}
