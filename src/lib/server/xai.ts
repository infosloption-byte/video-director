import { createServerFn } from "@tanstack/react-start";
import type { DirectedScript, FrameworkId, Topic } from "@/lib/types";
import {
  attachVisuals,
  fallbackDirect,
  parseDirectedScript,
} from "@/lib/director";
import { wordsFromCharTimestamps } from "@/lib/timings";
import { estimateWordTimings } from "@/lib/timings";
import { estimateSeconds } from "@/lib/utils";

const MODEL = "grok-4.5";

function apiKey() {
  return process.env.XAI_API_KEY;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model output");
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

async function chatJson(system: string, user: string, maxTokens = 2200) {
  const key = apiKey();
  if (!key) return { ok: false as const, error: "AI is not available" };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    return { ok: false as const, error: `xAI API error ${res.status}` };
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  try {
    return { ok: true as const, json: extractJson(text) };
  } catch {
    return { ok: false as const, error: "Director returned unreadable JSON" };
  }
}

const DIRECTOR_SYSTEM = `You are Helix, an auto-director for Facebook Reels in Science & Technology.
You never write a generic summary. You force research into a high-retention short-form Reel.

Hard rules:
- 9:16 vertical. Spoken length 20–35 seconds. 65–90 words total.
- Scene 1 is the hook: one sentence, under 3 seconds. No "hey guys", no slow intro.
- Sentences under 12 words. Tone: urgent, energetic, curious. Not a lecture.
- No academic jargon. Replace it with a physical analogy.
- Visual pattern interrupt every scene (2–3 seconds of new information).
- End with a debate question that people will actually argue about in comments.
- Captions use natural SEO keywords (not hashtag stuffing in the spoken track).
- On-screen text sits in the upper-middle safe zone; keep it under 6 words.
- Always explain WHY you made each choice in the reasoning fields.

Return ONLY JSON with this exact shape:
{
  "selectedFramework": "debunker" | "how_it_works" | "future_timeline" | "disruptor",
  "frameworkReasoning": string,
  "suggestedTitle": string,
  "hookType": "negative_warning" | "curiosity_gap" | "us_vs_them" | "transformation" | "exposing_secrets",
  "hookReasoning": string,
  "seoCaption": string,
  "firstComment": string,
  "debateQuestion": string,
  "keywords": string[],
  "voiceDirection": string,
  "scenes": [
    {
      "sceneOrder": number,
      "durationSeconds": number,
      "spokenText": string,
      "onScreenText": string,
      "scriptReasoning": string,
      "brollSearchTerm": string,
      "visualReasoning": string
    }
  ]
}

Frameworks:
- debunker: challenge a common belief. Hook = negative warning or us vs them.
- how_it_works: problem → mechanism in 2 steps → the catch. Hook = curiosity gap.
- future_timeline: now / year 5 / year 10. Hook = transformation tease.
- disruptor: small team vs incumbent cost. Hook = us vs them or exposing secrets.

brollSearchTerm must be 2–4 concrete visual keywords (e.g. "satellite orbit earth"), never abstract words like "innovation".`;

export const getDirectorStatus = createServerFn({ method: "GET" }).handler(
  async () => ({ available: Boolean(apiKey()) }),
);

export const directReel = createServerFn({ method: "POST" })
  .validator(
    (input: {
      topic: Topic;
      framework?: FrameworkId;
    }) => input,
  )
  .handler(async ({ data }): Promise<
    | { ok: true; script: DirectedScript; source: "grok" | "template" }
    | { ok: false; error: string; script: DirectedScript; source: "template" }
  > => {
    const preferred = data.framework ?? data.topic.suggestedFramework;
    const user = [
      data.framework
        ? `Use this framework (user overrode the auto-pick): ${data.framework}`
        : "Pick the best framework for this source and explain why.",
      `Headline: ${data.topic.headline}`,
      `Source: ${data.topic.source}`,
      `Category: ${data.topic.category}`,
      `Blurb: ${data.topic.blurb}`,
      `Trend: ${data.topic.trendReasoning}`,
      `Full source notes:\n${data.topic.rawContent}`,
    ].join("\n");

    const result = await chatJson(DIRECTOR_SYSTEM, user);
    if (result.ok) {
      try {
        const parsed = parseDirectedScript(result.json);
        const script: DirectedScript = data.framework
          ? { ...parsed, selectedFramework: preferred }
          : parsed;
        return { ok: true, script, source: "grok" };
      } catch {
        const script = fallbackDirect(data.topic, preferred);
        return {
          ok: false,
          error: "Director JSON failed validation",
          script,
          source: "template",
        };
      }
    }

    const script = fallbackDirect(data.topic, preferred);
    return {
      ok: false,
      error: result.error,
      script,
      source: "template",
    };
  });

export const scanSignals = createServerFn({ method: "POST" })
  .validator((input: { seedHeadlines: string[] }) => input)
  .handler(async ({ data }) => {
    const system = `You are a science & technology assignment editor for Facebook Reels.
Return JSON: { "topics": [ ... 8 items ] }.
Each topic:
{
  "headline": string (no clickbait punctuation spam),
  "source": string (plausible outlet: Nature, Science, MIT Technology Review, Joule, IEEE Spectrum, arXiv, Lancet Digital Health),
  "category": "Space" | "Energy" | "Biotech" | "AI" | "Hardware" | "Physics",
  "blurb": string (1–2 sentences, concrete),
  "trendReasoning": string (start with why it is a signal today: search spike, debate, paper, offtake),
  "searchDelta": number (80-400),
  "suggestedFramework": "debunker" | "how_it_works" | "future_timeline" | "disruptor",
  "rawContent": string (180–280 words of accurate-feeling briefing a director can script from. No invented exact statistics unless clearly marked as typical ranges.)
}
Avoid duplicating these headlines: ${data.seedHeadlines.join(" | ")}
Prefer 2026-current research directions. Mix the four frameworks.`;

    const result = await chatJson(
      system,
      "Scan today's science and tech signals for short-form Reels.",
      3500,
    );
    if (!result.ok) return { ok: false as const, error: result.error };

    const json = result.json as { topics?: unknown };
    if (!Array.isArray(json.topics)) {
      return { ok: false as const, error: "No topics returned" };
    }
    return { ok: true as const, topics: json.topics };
  });

export const synthesizeVoice = createServerFn({ method: "POST" })
  .validator((input: { text: string; voiceId: string }) => input)
  .handler(async ({ data }) => {
    const key = apiKey();
    if (!key) return { ok: false as const, error: "AI is not available" };

    const text = data.text.slice(0, 4000);
    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        text,
        voice_id: data.voiceId || "helix",
        language: "en",
        speed: 1.1,
        with_timestamps: true,
        text_normalization: true,
      }),
    });

    if (!res.ok) {
      return { ok: false as const, error: `Voice API error ${res.status}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await res.json()) as {
        audio?: string;
        content_type?: string;
        duration?: number;
        audio_timestamps?: {
          graph_chars?: string[];
          graph_times?: [number, number][];
        };
      };
      if (!body.audio) {
        return { ok: false as const, error: "Voice API returned no audio" };
      }
      const chars = body.audio_timestamps?.graph_chars ?? [];
      const times = body.audio_timestamps?.graph_times ?? [];
      const words =
        chars.length && times.length
          ? wordsFromCharTimestamps(chars, times)
          : estimateWordTimings(text, 1.1);
      const duration =
        typeof body.duration === "number" && body.duration > 0
          ? body.duration
          : words.at(-1)?.end ?? estimateSeconds(text, 1.1);
      const mime = body.content_type || "audio/mpeg";
      return {
        ok: true as const,
        audioDataUrl: `data:${mime};base64,${body.audio}`,
        duration,
        words,
      };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const b64 = buf.toString("base64");
    const mime = contentType || "audio/mpeg";
    const words = estimateWordTimings(text, 1.1);
    return {
      ok: true as const,
      audioDataUrl: `data:${mime};base64,${b64}`,
      duration: words.at(-1)?.end ?? estimateSeconds(text, 1.1),
      words,
    };
  });


