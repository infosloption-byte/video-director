import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Project, ReachCheck } from "@/lib/types";
import { scoreReach } from "@/lib/reach";
import { VOICES } from "@/lib/frameworks";
import { cn } from "@/lib/utils";

function CopyBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Could not copy");
    }
  }
  return (
    <div className="rounded-lg bg-elevated p-3 shadow-[var(--shadow-border)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-wide text-subtle">
          {label}
        </p>
        <button
          type="button"
          onClick={copy}
          className="flex size-9 items-center justify-center rounded-sm text-muted hover:text-fg"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
      <p className="text-sm leading-relaxed text-fg">{value}</p>
    </div>
  );
}

export function ExportPack({
  project,
  onVoice,
  onVoiceover,
  voicing,
}: {
  project: Project;
  onVoice: (id: string) => void;
  onVoiceover: () => void;
  voicing: boolean;
}) {
  const checks: ReachCheck[] = scoreReach(project);
  const passed = checks.filter((c) => c.pass).length;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h3 className="font-display text-2xl">Reach checklist</h3>
          <p className="font-mono text-xs text-muted tabular-nums">
            {passed}/{checks.length} locked
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {checks.map((check) => (
            <li
              key={check.id}
              className="flex gap-3 rounded-md bg-surface px-3 py-2.5 shadow-[var(--shadow-border)]"
            >
              <span
                className={cn(
                  "mt-0.5 size-2 shrink-0 rounded-full",
                  check.pass ? "bg-ok" : "bg-warn",
                )}
              />
              <div>
                <p className="text-sm text-fg">{check.label}</p>
                <p className="text-xs text-subtle">{check.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 font-display text-2xl">Voice</h3>
        <p className="mb-3 text-sm text-muted">{project.voiceDirection}</p>
        <div className="flex flex-wrap gap-2">
          {VOICES.map((voice) => {
            const on = voice.id === project.voiceId;
            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => onVoice(voice.id)}
                className={cn(
                  "rounded-full px-3 py-2 text-sm shadow-[var(--shadow-border)]",
                  on ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                )}
              >
                {voice.name}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-subtle">
          {VOICES.find((v) => v.id === project.voiceId)?.note}
        </p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={onVoiceover}
          disabled={voicing}
        >
          {voicing ? "Voicing the cut…" : "Voice this Reel"}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-2xl">Publish pack</h3>
        <p className="text-sm text-muted">
          Copy these into Facebook as soon as you post. The first comment and the
          debate question are the engagement seeds.
        </p>
        <CopyBlock label="Caption" value={project.seoCaption} />
        <CopyBlock label="First comment" value={project.firstComment} />
        <CopyBlock label="Debate question" value={project.debateQuestion} />
        <CopyBlock
          label="Spoken script"
          value={project.scenes.map((s) => s.spokenText).join(" ")}
        />
      </section>
    </div>
  );
}
