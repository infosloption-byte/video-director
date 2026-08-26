import { cn } from "@/lib/utils";

const STEPS = [
  { id: "framework", label: "Framework" },
  { id: "storyboard", label: "Storyboard" },
  { id: "preview", label: "Preview" },
] as const;

export type StudioStep = (typeof STEPS)[number]["id"];

export function Stepper({
  step,
  onChange,
}: {
  step: StudioStep;
  onChange: (step: StudioStep) => void;
}) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <nav aria-label="Pipeline" className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((item, i) => {
        const active = item.id === step;
        const done = i < current;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "flex h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm transition-colors duration-150",
              active ? "bg-elevated text-fg" : "text-subtle hover:text-fg",
            )}
          >
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                active || done ? "text-fg" : "text-subtle",
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
