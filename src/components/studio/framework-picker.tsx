import { FRAMEWORKS } from "@/lib/frameworks";
import type { FrameworkId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WhyCallout } from "./why-callout";

export function FrameworkPicker({
  selected,
  reasoning,
  onSelect,
}: {
  selected: FrameworkId;
  reasoning: string;
  onSelect: (id: FrameworkId) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <WhyCallout label="Auto-picked">{reasoning}</WhyCallout>
      <div className="grid gap-3 sm:grid-cols-2">
        {FRAMEWORKS.map((fw) => {
          const active = fw.id === selected;
          return (
            <button
              key={fw.id}
              type="button"
              onClick={() => onSelect(fw.id)}
              className={cn(
                "rounded-xl p-4 text-left shadow-[var(--shadow-border)] transition-[box-shadow,background-color] duration-150",
                active
                  ? "bg-elevated shadow-[var(--shadow-border-hover)]"
                  : "bg-surface hover:shadow-[var(--shadow-border-hover)]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl text-fg">{fw.name}</h3>
                {active ? (
                  <span className="font-mono text-[11px] uppercase tracking-wide text-ok">
                    Selected
                  </span>
                ) : (
                  <span className="font-mono text-[11px] uppercase tracking-wide text-subtle">
                    Swap
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{fw.short}</p>
              <p className="mt-3 text-xs text-subtle">{fw.bestFor}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
