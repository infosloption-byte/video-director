import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { DirectingState } from "@/components/studio/directing";
import { ExportPack } from "@/components/studio/export-pack";
import { FrameworkPicker } from "@/components/studio/framework-picker";
import { ReelPlayer } from "@/components/studio/reel-player";
import { Stepper, type StudioStep } from "@/components/studio/stepper";
import { Storyboard } from "@/components/studio/storyboard";
import { WhyCallout } from "@/components/studio/why-callout";
import { frameworkById } from "@/lib/frameworks";
import { fullScript } from "@/lib/reach";
import { directReel, synthesizeVoice } from "@/lib/server/xai";
import { useHelix, useProject } from "@/lib/store";
import { useHydrated } from "@/lib/use-hydrated";
import type { DirectedScript, FrameworkId, Voiceover } from "@/lib/types";
import { hashText } from "@/lib/utils";

export const Route = createFileRoute("/studio/$projectId")({
  component: StudioPage,
});

const voiceCache = new Map<string, Voiceover>();
const directCache = new Map<
  string,
  Promise<
    | { ok: true; script: DirectedScript; source: "grok" | "template" }
    | { ok: false; error: string; script: DirectedScript; source: "template" }
  >
>();

function StudioPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const applyScript = useHelix((s) => s.applyScript);
  const setFramework = useHelix((s) => s.setFramework);
  const swapVisual = useHelix((s) => s.swapVisual);
  const setVoice = useHelix((s) => s.setVoice);
  const markDirecting = useHelix((s) => s.markDirecting);
  const markError = useHelix((s) => s.markError);
  const hydrated = useHydrated();
  const [step, setStep] = useState<StudioStep>("storyboard");
  const [voicing, setVoicing] = useState(false);
  const [voiceover, setVoiceover] = useState<Voiceover | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!project) {
      void navigate({ to: "/" });
    }
  }, [hydrated, project, navigate]);

  useEffect(() => {
    if (!hydrated || !project || project.status !== "directing") return;
    const key = `${project.id}:${project.framework}`;
    let cancelled = false;
    const existing = directCache.get(key);
    const request =
      existing ??
      directReel({
        data: {
          topic: project.topic,
          framework: project.framework,
        },
      });
    if (!existing) directCache.set(key, request);

    void request
      .then((result) => {
        if (cancelled) return;
        applyScript(project.id, result.script, "ready");
        setStep("storyboard");
        if (result.ok && result.source === "grok") {
          toast("Storyboard locked");
        } else {
          toast("Cut from onboard templates");
        }
      })
      .catch(() => {
        if (!cancelled) markError(project.id, "Director failed");
      });

    return () => {
      cancelled = true;
    };
  }, [
    hydrated,
    projectId,
    project,
    applyScript,
    markError,
  ]);

  useEffect(() => {
    setVoiceover(null);
  }, [projectId, project?.voiceId, project?.title]);

  if (!hydrated || !project) {
    return (
      <AppShell>
        <DirectingState headline="Loading the cut…" />
      </AppShell>
    );
  }

  const current = project;
  const fw = frameworkById(current.framework);

  function runDirector(framework?: FrameworkId) {
    if (framework) setFramework(current.id, framework);
    else markDirecting(current.id);
  }

  async function voiceReel() {
    const text = fullScript(current);
    const key = `${current.id}:${current.voiceId}:${hashText(text)}`;
    const cached = voiceCache.get(key);
    if (cached) {
      setVoiceover(cached);
      toast("Loaded cached voice");
      return;
    }
    setVoicing(true);
    try {
      const result = await synthesizeVoice({
        data: { text, voiceId: current.voiceId },
      });
      if (!result.ok) {
        toast(result.error);
        return;
      }
      const vo: Voiceover = {
        audioUrl: result.audioDataUrl,
        duration: result.duration,
        words: result.words,
        voiceId: current.voiceId,
        scriptHash: key,
      };
      voiceCache.set(key, vo);
      setVoiceover(vo);
      toast("Voiceover ready");
    } catch {
      toast("Could not voice this Reel");
    } finally {
      setVoicing(false);
    }
  }

  return (
    <AppShell
      className="max-w-6xl"
      right={
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft />
          Signals
        </Button>
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wide text-subtle">
            {project.topic.source} · {fw.name}
          </p>
          <h1 className="mt-1 font-display text-3xl tracking-tight sm:text-4xl">
            {project.title}
          </h1>
        </div>
        <Stepper step={step} onChange={setStep} />
      </div>

      {project.status === "directing" ? (
        <DirectingState headline={project.topic.headline} />
      ) : project.status === "error" ? (
        <DirectingState
          headline={project.topic.headline}
          error={project.error ?? "Director failed"}
          onRetry={() => runDirector()}
        />
      ) : (
        <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-24">
            <ReelPlayer project={project} voiceover={voiceover} />
          </div>
          <div className="min-w-0">
            {step === "framework" ? (
              <FrameworkPicker
                selected={project.framework}
                reasoning={project.frameworkReasoning}
                onSelect={(id) => {
                  if (id === project.framework) return;
                  runDirector(id);
                }}
              />
            ) : null}
            {step === "storyboard" ? (
              <Storyboard
                project={project}
                onSwap={(order, index) => swapVisual(project.id, order, index)}
              />
            ) : null}
            {step === "preview" ? (
              <div className="flex flex-col gap-5">
                <WhyCallout>
                  {project.voiceDirection} Captions stay in the upper-middle
                  safe zone so Facebook’s buttons never cover the hook.
                </WhyCallout>
                <ExportPack
                  project={project}
                  voicing={voicing}
                  onVoice={(id) => setVoice(project.id, id)}
                  onVoiceover={() => void voiceReel()}
                />
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              {step !== "framework" ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    setStep(step === "preview" ? "storyboard" : "framework")
                  }
                >
                  <ArrowLeft />
                  Back
                </Button>
              ) : null}
              {step !== "preview" ? (
                <Button
                  onClick={() =>
                    setStep(step === "framework" ? "storyboard" : "preview")
                  }
                >
                  {step === "storyboard" ? "Preview & publish pack" : "Storyboard"}
                  <ArrowRight />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
