import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RefreshCw, Clapperboard } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { TopicCard } from "@/components/feed/topic-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useHelix } from "@/lib/store";
import { useHydrated } from "@/lib/use-hydrated";
import { scanSignals } from "@/lib/server/xai";
import { parseTopics } from "@/lib/parse-topics";
import type { Category, Topic } from "@/lib/types";
import { SAMPLE_PROJECT } from "@/lib/sample-project";

const FILTERS: Array<"All" | Category> = [
  "All",
  "AI",
  "Physics",
  "Energy",
  "Biotech",
  "Hardware",
  "Space",
];

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const topics = useHelix((s) => s.topics);
  const projects = useHelix((s) => s.projects);
  const createFromTopic = useHelix((s) => s.createFromTopic);
  const upsertSample = useHelix((s) => s.upsertSample);
  const replaceTopics = useHelix((s) => s.replaceTopics);
  const resetTopics = useHelix((s) => s.resetTopics);
  const topicsGeneratedAt = useHelix((s) => s.topicsGeneratedAt);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [scanning, setScanning] = useState(false);

  const visible = useMemo(
    () =>
      filter === "All" ? topics : topics.filter((t) => t.category === filter),
    [topics, filter],
  );

  const readyProjects = projects.filter(
    (p) => p.status === "ready" && p.id !== SAMPLE_PROJECT.id,
  );

  function openTopic(topic: Topic) {
    if (!hydrated) return;
    const project = createFromTopic(topic);
    void navigate({
      to: "/studio/$projectId",
      params: { projectId: project.id },
    });
  }

  function openSample() {
    const project = upsertSample();
    void navigate({
      to: "/studio/$projectId",
      params: { projectId: project.id },
    });
  }

  async function scan() {
    setScanning(true);
    try {
      const result = await scanSignals({
        data: { seedHeadlines: topics.map((t) => t.headline) },
      });
      if (!result.ok) {
        toast(result.error);
        return;
      }
      const next = parseTopics(result.topics);
      if (next.length === 0) {
        toast("No new signals returned");
        return;
      }
      replaceTopics(next);
      toast("Feed refreshed");
    } catch {
      toast("Could not scan signals");
    } finally {
      setScanning(false);
    }
  }

  return (
    <AppShell
      right={
        <>
          <Badge tone="muted" className="hidden sm:inline-flex">
            {hydrated
              ? `${projects.length} reel${projects.length === 1 ? "" : "s"}`
              : "Studio"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={scan}
            disabled={scanning || !hydrated}
          >
            <RefreshCw className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning" : "Scan signals"}
          </Button>
        </>
      }
    >
      <section className="max-w-3xl">
        <p className="rise-in font-mono text-xs uppercase tracking-wide text-subtle">
          Science & tech auto-director
        </p>
        <h1 className="rise-in delay-1 mt-3 font-display text-4xl leading-tight tracking-tight sm:text-6xl">
          Pick a signal. Helix directs the Reel.
        </h1>
        <p className="rise-in delay-2 mt-5 max-w-xl text-base text-muted sm:text-lg">
          Zero typing. Helix chooses the narrative, writes the hook, casts
          B-roll, and shows the reasoning on every cut. You approve — or swap.
        </p>
        <div className="rise-in delay-3 mt-6 flex flex-wrap gap-3">
          <Button onClick={openSample} disabled={!hydrated}>
            <Clapperboard />
            Play the sample cut
          </Button>
          {topicsGeneratedAt ? (
            <Button variant="ghost" onClick={resetTopics}>
              Restore desk list
            </Button>
          ) : null}
        </div>
      </section>

      {hydrated && readyProjects.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-mono text-xs uppercase tracking-wide text-subtle">
            Your Reels
          </h2>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {readyProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() =>
                  navigate({
                    to: "/studio/$projectId",
                    params: { projectId: project.id },
                  })
                }
                className="w-44 shrink-0 rounded-lg bg-surface p-3 text-left shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
              >
                <p className="line-clamp-2 font-display text-lg leading-snug">
                  {project.title}
                </p>
                <p className="mt-2 font-mono text-[11px] text-subtle">
                  {project.topic.category}
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-3xl">Today’s signals</h2>
            <p className="mt-1 text-sm text-muted">
              Ordered by search heat. Helix already knows which framework fits.
            </p>
          </div>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={
                item === filter
                  ? "h-11 shrink-0 rounded-full bg-accent px-4 text-sm text-accent-fg"
                  : "h-11 shrink-0 rounded-full bg-elevated px-4 text-sm text-muted hover:text-fg"
              }
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {!hydrated
            ? [0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-56 rounded-xl" />
              ))
            : visible.map((topic, i) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  index={i}
                  featured={i === 0 && filter === "All"}
                  onDirect={openTopic}
                />
              ))}
        </div>
      </section>
    </AppShell>
  );
}
