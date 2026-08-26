import { Check } from "lucide-react";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WhyCallout } from "./why-callout";

export function Storyboard({
  project,
  onSwap,
}: {
  project: Project;
  onSwap: (sceneOrder: number, index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <WhyCallout label="Hook">
        {project.hookReasoning ||
          "Scene 1 is a 3-second interrupt. Everything after it has to earn the hold."}
      </WhyCallout>
      <ol className="flex flex-col gap-4">
        {project.scenes.map((scene) => {
          const selected = scene.visuals[scene.selectedIndex] ?? scene.visuals[0];
          return (
            <li
              key={scene.sceneOrder}
              className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]"
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-md bg-elevated">
                  {selected ? (
                    <img
                      src={selected.url}
                      alt={selected.alt}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <span className="absolute top-2 left-2 font-mono text-[10px] text-fg">
                    {String(scene.sceneOrder).padStart(2, "0")}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg leading-snug text-fg">
                      {scene.onScreenText}
                    </p>
                    <span className="font-mono text-xs text-subtle tabular-nums">
                      {scene.durationSeconds.toFixed(1)}s
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{scene.spokenText}</p>
                  <p className="mt-3 text-xs leading-relaxed text-subtle">
                    <span className="font-mono uppercase tracking-wide text-muted">
                      Why this line
                    </span>{" "}
                    {scene.scriptReasoning}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-subtle">
                    <span className="font-mono uppercase tracking-wide text-muted">
                      Why this picture
                    </span>{" "}
                    {scene.visualReasoning}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-subtle">
                  Swap visual · {scene.visuals.length} prefetched
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {scene.visuals.map((visual, i) => {
                    const on = i === scene.selectedIndex;
                    return (
                      <button
                        key={visual.id}
                        type="button"
                        onClick={() => onSwap(scene.sceneOrder, i)}
                        className={cn(
                          "relative h-16 w-11 shrink-0 overflow-hidden rounded-sm",
                          on
                            ? "shadow-[0_0_0_2px_var(--color-accent)]"
                            : "opacity-70 hover:opacity-100",
                        )}
                        aria-label={`Use ${visual.alt}`}
                      >
                        <img
                          src={visual.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        {on ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-bg/30">
                            <Check className="size-3.5 text-fg" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
