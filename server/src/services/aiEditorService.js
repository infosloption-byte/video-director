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
        sourceId: clip.sourceId,
        assetId: clip.assetId,
        start: clip.start,
        duration: clip.duration,
        offset: clip.offset,
        text: clip.text,
        volume: clip.volume,
      })),
    })),
  };
}

function compactAssets(scenes) {
  return (scenes || []).map((scene) => ({
    sceneId: scene.id,
    title: scene.title,
    assets: (scene.assets || []).map((asset) => ({
      assetId: asset.id,
      videoUrl: asset.videoUrl,
      thumbnailUrl: asset.thumbnailUrl,
    })),
  }));
}

export async function suggestEditorOperations({ timeline, instruction, scenes = [] }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI editing is not configured. Set GEMINI_API_KEY on the server.");
  const prompt = `You are the Helix AI editing assistant. Return ONLY JSON. Suggest safe, reversible operations for the independent editor timeline. Never delete or modify source media, storyboard records, narration source records, or external assets. Only reference existing timeline clip IDs and B-roll assets listed below. Maximum 25 operations.

Supported operation types:
- trim_clip: shorten or reposition an existing clip safely.
- move_clip: change an existing clip start time.
- split_clip: split an existing clip at a safe point.
- delete_clip: remove an editor-only clip when it improves pacing.
- update_caption: rewrite an existing caption for clarity or emphasis.
- set_volume: adjust an existing audio clip volume.
- add_text_overlay: add a stable-id editor-only text overlay.
- replace_broll: replace a video clip with one of the listed assets from the same scene. Include clipId, sourceId, assetId, videoUrl as src, and thumbnailUrl.
- regenerate_narration: propose improved narration wording for an existing narration audio clip. This is a suggestion only; it must never change source Storyboard narration or audio files directly. Include clipId and the complete replacement text.

For caption requests, use update_caption. For narration requests, use regenerate_narration. For B-roll requests, use replace_broll only with an assetId and URL from the supplied asset list. For hooks/pacing, prefer trim_clip, move_clip, split_clip, and add_text_overlay. Do not invent IDs, URLs, or assets. For a B-roll replacement, keep sourceId equal to the clip's sourceId and choose an asset belonging to that scene.

User instruction: ${String(instruction || "").slice(0, 1200)}

Current editor timeline:\n${JSON.stringify(compactTimeline(timeline))}

Available scene B-roll assets:\n${JSON.stringify(compactAssets(scenes))}`;

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
