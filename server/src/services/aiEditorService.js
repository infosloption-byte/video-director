import { validateEditorOperations } from "./editorOperations.js";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function extractJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI returned no JSON suggestion.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function compactTimeline(timeline) {
  return {
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    duration: timeline.duration,
    tracks: (timeline.tracks || []).map((track) => ({
      id: track.id,
      kind: track.kind,
      name: track.name,
      locked: track.locked,
      clips: (track.clips || []).map((clip) => ({
        id: clip.id,
        type: clip.type,
        start: clip.start,
        duration: clip.duration,
        offset: clip.offset,
        text: clip.text,
        volume: clip.volume,
      })),
    })),
  };
}

export async function suggestEditorOperations({ timeline, instruction }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI editing is not configured. Set GEMINI_API_KEY on the server.");
  const prompt = `You are the Helix AI editing assistant. Return ONLY JSON. Suggest safe, reversible operations for the independent editor timeline. Never delete or modify source media, storyboard records, narration source records, or external assets. Only use existing clip IDs for edits. For new overlays, create a stable id. Maximum 25 operations. Supported operation types: trim_clip, move_clip, split_clip, delete_clip, update_caption, set_volume, add_text_overlay. JSON shape: {"summary":"short explanation","reasoning":"brief reason","operations":[...]}.

User instruction: ${String(instruction || "").slice(0, 1200)}

Current editor timeline:\n${JSON.stringify(compactTimeline(timeline))}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "AI suggestion request failed.");
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const result = extractJson(text);
  const operations = validateEditorOperations(result.operations);
  return { summary: String(result.summary || "Suggested editor changes."), reasoning: String(result.reasoning || "The suggestion is based on the current editor timeline and your instruction."), operations };
}
