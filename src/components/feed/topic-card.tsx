import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Topic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FRAMEWORKS } from "@/lib/frameworks";

export function TopicCard({
  topic,
  index,
  featured,
  onDirect,
}: {
  topic: Topic;
  index: number;
  featured?: boolean;
  onDirect: (topic: Topic) => void;
}) {
  const framework = FRAMEWORKS.find((f) => f.id === topic.suggestedFramework);
  return (
    <article
      className={cn(
        "group flex flex-col rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-200 ease-out hover:shadow-[var(--shadow-border-hover)]",
        featured && "sm:col-span-2 sm:flex-row sm:gap-8 sm:p-6",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-subtle tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <Badge>{topic.category}</Badge>
          <Badge tone="ok">+{topic.searchDelta}%</Badge>
        </div>
        <h3
          className={cn(
            "mt-4 font-display tracking-tight text-fg",
            featured ? "text-3xl sm:text-4xl" : "text-2xl",
          )}
        >
          {topic.headline}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-muted">{topic.blurb}</p>
        <p className="mt-4 text-xs leading-relaxed text-subtle">
          <span className="font-mono uppercase tracking-wide text-muted">
            Why this
          </span>{" "}
          {topic.trendReasoning}
        </p>
      </div>
      <div
        className={cn(
          "mt-5 flex flex-col justify-end gap-3",
          featured && "sm:mt-0 sm:w-56 sm:shrink-0",
        )}
      >
        <p className="text-xs text-subtle">
          <span className="text-muted">{topic.source}</span>
          {" · "}
          Auto-picks {framework?.name}
        </p>
        <Button onClick={() => onDirect(topic)} className="w-full sm:w-auto">
          Direct this Reel
          <ArrowUpRight />
        </Button>
      </div>
    </article>
  );
}
