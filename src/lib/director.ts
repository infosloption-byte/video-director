import type {
  DirectedScript,
  FrameworkId,
  HookType,
  Scene,
  Topic,
} from "./types";
import { FRAMEWORKS } from "./frameworks";
import { matchVisuals } from "./visuals";
import { estimateSeconds } from "./utils";

const FRAMEWORK_IDS: FrameworkId[] = [
  "debunker",
  "how_it_works",
  "future_timeline",
  "disruptor",
];

const HOOK_IDS: HookType[] = [
  "negative_warning",
  "curiosity_gap",
  "us_vs_them",
  "transformation",
  "exposing_secrets",
];

export function attachVisuals(
  scenes: DirectedScript["scenes"],
): Scene[] {
  return scenes.map((scene) => ({
    ...scene,
    visuals: matchVisuals(scene.brollSearchTerm, 5),
    selectedIndex: 0,
  }));
}

export function parseDirectedScript(raw: unknown): DirectedScript {
  const data = raw as Record<string, unknown>;
  const framework = FRAMEWORK_IDS.includes(data.selectedFramework as FrameworkId)
    ? (data.selectedFramework as FrameworkId)
    : "how_it_works";
  const hookType = HOOK_IDS.includes(data.hookType as HookType)
    ? (data.hookType as HookType)
    : "curiosity_gap";
  const sceneRaw = Array.isArray(data.scenes) ? data.scenes : [];
  const scenes = sceneRaw.slice(0, 7).map((item, index) => {
    const s = (item ?? {}) as Record<string, unknown>;
    const spoken = String(s.spokenText ?? "").trim();
    const duration =
      typeof s.durationSeconds === "number" && s.durationSeconds > 0
        ? s.durationSeconds
        : estimateSeconds(spoken);
    return {
      sceneOrder: index + 1,
      durationSeconds: Math.round(duration * 10) / 10,
      spokenText: spoken || "Stay with this.",
      onScreenText: String(s.onScreenText ?? "").trim() || spoken.slice(0, 42),
      scriptReasoning: String(s.scriptReasoning ?? "").trim() || "Paced for retention.",
      brollSearchTerm: String(s.brollSearchTerm ?? "science lab").trim(),
      visualReasoning:
        String(s.visualReasoning ?? "").trim() || "High-tech context, no talking-head dead air.",
    };
  });

  if (scenes.length === 0) {
    throw new Error("Director returned no scenes");
  }

  return {
    selectedFramework: framework,
    frameworkReasoning: String(data.frameworkReasoning ?? ""),
    suggestedTitle: String(data.suggestedTitle ?? "Untitled Reel"),
    hookType,
    hookReasoning: String(data.hookReasoning ?? ""),
    seoCaption: String(data.seoCaption ?? ""),
    firstComment: String(data.firstComment ?? ""),
    debateQuestion: String(data.debateQuestion ?? ""),
    keywords: Array.isArray(data.keywords)
      ? data.keywords.map((k) => String(k)).slice(0, 8)
      : [],
    voiceDirection: String(data.voiceDirection ?? "Urgent, curious, 1.1x pace."),
    scenes,
  };
}

export function fallbackDirect(
  topic: Topic,
  framework?: FrameworkId,
): DirectedScript {
  const fw = framework ?? topic.suggestedFramework;
  const meta = FRAMEWORKS.find((f) => f.id === fw) ?? FRAMEWORKS[0];
  const title = topic.headline;
  const noun = topic.category.toLowerCase();

  const byFramework: Record<FrameworkId, DirectedScript["scenes"]> = {
    debunker: [
      {
        sceneOrder: 1,
        durationSeconds: 3,
        spokenText: `Stop believing the headline version of ${topic.headline.toLowerCase()}.`,
        onScreenText: "Stop believing the headline",
        scriptReasoning: "Negative-warning hook. Attacks a lazy belief in under 3 seconds.",
        brollSearchTerm: `${topic.category} lab`,
        visualReasoning: "Open on motion in the niche so the first frame is not a talking head.",
      },
      {
        sceneOrder: 2,
        durationSeconds: 6,
        spokenText: topic.blurb,
        onScreenText: "What actually happened",
        scriptReasoning: "Replace the myth with the real result, still in plain language.",
        brollSearchTerm: topic.category,
        visualReasoning: "Stay in-niche. No random stock city.",
      },
      {
        sceneOrder: 3,
        durationSeconds: 8,
        spokenText:
          "The paper is narrower than the viral post. That gap is where people get the science wrong.",
        onScreenText: "The paper is narrower",
        scriptReasoning: "Teach the correction. This is the save-worthy line.",
        brollSearchTerm: "research scientist lab",
        visualReasoning: "A real lab shot signals we read the source.",
      },
      {
        sceneOrder: 4,
        durationSeconds: 7,
        spokenText:
          "If the numbers hold, the next five years change. If they do not, this was a press cycle.",
        onScreenText: "If the numbers hold",
        scriptReasoning: "Honest stakes. Science audiences punish hype.",
        brollSearchTerm: "data network",
        visualReasoning: "Abstract data imagery for the uncertainty beat.",
      },
      {
        sceneOrder: 5,
        durationSeconds: 4,
        spokenText: `Would you bet on this ${noun} claim?`,
        onScreenText: "Would you bet on it?",
        scriptReasoning: "Debate CTA for comment velocity.",
        brollSearchTerm: topic.category,
        visualReasoning: "Return to the object of the bet.",
      },
    ],
    how_it_works: [
      {
        sceneOrder: 1,
        durationSeconds: 3,
        spokenText: `Here's how ${title.toLowerCase()} actually works.`,
        onScreenText: "How it actually works",
        scriptReasoning: "Curiosity-gap title hook. Promise a mechanism, not a vibe.",
        brollSearchTerm: topic.category,
        visualReasoning: "Establish the domain in the first 1.5 seconds.",
      },
      {
        sceneOrder: 2,
        durationSeconds: 6,
        spokenText: topic.blurb,
        onScreenText: "The problem it attacks",
        scriptReasoning: "Name what is broken before the invention.",
        brollSearchTerm: `${topic.category} problem`,
        visualReasoning: "Show the old way so the new way has contrast.",
      },
      {
        sceneOrder: 3,
        durationSeconds: 8,
        spokenText:
          "Researchers split the hard part into two moves: sense the world more cleanly, then spend less energy doing it.",
        onScreenText: "Two moves. That's it.",
        scriptReasoning: "Mechanism in two steps. No jargon pile-up.",
        brollSearchTerm: "lab hardware chip",
        visualReasoning: "Hardware close-ups sell ‘this is a real device’.",
      },
      {
        sceneOrder: 4,
        durationSeconds: 7,
        spokenText:
          "The catch is cost, size, and whether it survives outside a quiet lab.",
        onScreenText: "The catch: cost and size",
        scriptReasoning: "Every How-It-Works needs the limitation or it feels like an ad.",
        brollSearchTerm: "engineer prototype",
        visualReasoning: "A prototype shot is more honest than a glossy render.",
      },
      {
        sceneOrder: 5,
        durationSeconds: 4,
        spokenText: "Save this for when the first commercial version ships.",
        onScreenText: "Save this Reel",
        scriptReasoning: "Save CTA — high-intent signal for Meta.",
        brollSearchTerm: topic.category,
        visualReasoning: "End on the category image they will remember.",
      },
    ],
    future_timeline: [
      {
        sceneOrder: 1,
        durationSeconds: 3,
        spokenText: `Scientists just tested this. Here is the next decade.`,
        onScreenText: "The next 10 years",
        scriptReasoning: "Transformation tease. Promise a timeline, not a miracle.",
        brollSearchTerm: topic.category,
        visualReasoning: "Wide establishing shot of the field.",
      },
      {
        sceneOrder: 2,
        durationSeconds: 6,
        spokenText: `Year one to two: ${topic.blurb}`,
        onScreenText: "Year 1–2 · the lab",
        scriptReasoning: "Near-term is still research. Keep it concrete.",
        brollSearchTerm: "lab research",
        visualReasoning: "Lab imagery for the testing phase.",
      },
      {
        sceneOrder: 3,
        durationSeconds: 7,
        spokenText:
          "Year five: first prototypes or trials — if safety and cost do not stall the work.",
        onScreenText: "Year 5 · prototypes",
        scriptReasoning: "Mid-horizon with a condition. Credibility > certainty.",
        brollSearchTerm: "engineer hardware",
        visualReasoning: "Prototype / engineering footage.",
      },
      {
        sceneOrder: 4,
        durationSeconds: 7,
        spokenText:
          "Year ten: this either rewires an industry or stays a beautiful experiment.",
        onScreenText: "Year 10 · the fork",
        scriptReasoning: "Binary future. Invites the comment argument.",
        brollSearchTerm: "earth network city",
        visualReasoning: "Scale-out imagery for the societal beat.",
      },
      {
        sceneOrder: 5,
        durationSeconds: 4,
        spokenText: "Would you use this in ten years?",
        onScreenText: "Would you use it?",
        scriptReasoning: "Personal debate question.",
        brollSearchTerm: topic.category,
        visualReasoning: "Return to the subject.",
      },
    ],
    disruptor: [
      {
        sceneOrder: 1,
        durationSeconds: 3,
        spokenText: "A small lab just did this for a fraction of the usual cost.",
        onScreenText: "A fraction of the cost",
        scriptReasoning: "Us-vs-them hook. David vs Goliath in one line.",
        brollSearchTerm: topic.category,
        visualReasoning: "Open on the object being disrupted.",
      },
      {
        sceneOrder: 2,
        durationSeconds: 6,
        spokenText: topic.blurb,
        onScreenText: "What they actually pulled off",
        scriptReasoning: "Receipts before the pep talk.",
        brollSearchTerm: "lab scientist",
        visualReasoning: "People in a lab — the ‘small team’ visual.",
      },
      {
        sceneOrder: 3,
        durationSeconds: 8,
        spokenText:
          "The trick is not a bigger budget. It is a narrower bet the incumbents were too locked-in to make.",
        onScreenText: "A narrower bet",
        scriptReasoning: "Secret sauce in one sentence.",
        brollSearchTerm: "chip circuit hardware",
        visualReasoning: "Close-up of the method, not a CEO.",
      },
      {
        sceneOrder: 4,
        durationSeconds: 6,
        spokenText:
          "If it scales, ordinary labs get a tool that used to live behind a monopoly.",
        onScreenText: "The playing field tilts",
        scriptReasoning: "Why it matters to a non-specialist.",
        brollSearchTerm: "data center network",
        visualReasoning: "Scale imagery for the industry beat.",
      },
      {
        sceneOrder: 5,
        durationSeconds: 4,
        spokenText: "Drop PAPER in the comments if you want the study.",
        onScreenText: "Drop PAPER below",
        scriptReasoning: "Keyword-request CTA. High comment intent.",
        brollSearchTerm: topic.category,
        visualReasoning: "Hold the subject while they type.",
      },
    ],
  };

  const scenes = byFramework[fw];
  return {
    selectedFramework: fw,
    frameworkReasoning: `Selected ${meta.name} because this source is ${meta.bestFor.toLowerCase()}`,
    suggestedTitle: title,
    hookType: meta.hook,
    hookReasoning: `${meta.name} pairs with a ${meta.hook.replaceAll("_", " ")} opening — proven in the first 3 seconds.`,
    seoCaption: `${topic.headline}. ${topic.blurb} #${topic.category.replaceAll(" ", "")} #TechNews #Science`,
    firstComment: `Source: ${topic.source}. ${topic.trendReasoning}`,
    debateQuestion: `What do you think — is ${topic.headline.toLowerCase()} a real shift or a press cycle?`,
    keywords: [topic.category, "Tech News", "Science", topic.headline.split(" ")[0] ?? "Research"],
    voiceDirection: "Urgent, energetic, curious. 1.1x pace. No university-lecture tone.",
    scenes,
  };
}
