const ALLOWED_LENGTHS = [15, 30, 45, 60];

function parseJson(text) {
  try { return JSON.parse(text); } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (!fenced) throw new Error("Gemini returned invalid storyboard JSON.");
    return JSON.parse(fenced);
  }
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.35 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}.`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty storyboard.");
  return parseJson(text);
}

function normalizeScene(scene, index, targetLength) {
  const duration = Number(scene.duration_seconds);
  return {
    scene_order: index + 1,
    title: String(scene.title || `Scene ${index + 1}`).trim().slice(0, 255),
    spoken_text: String(scene.spoken_text || scene.line || "").trim(),
    duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.min(duration, 30) : Math.max(2, targetLength / 6),
    why_line: String(scene.why_line || "").trim(),
    why_picture: String(scene.why_picture || "").trim(),
    broll_search_term: String(scene.broll_search_term || scene.title || "science technology").trim().slice(0, 160),
  };
}

export async function generateStoryboard({ project, signal }) {
  const length = ALLOWED_LENGTHS.includes(Number(project.scriptLengthSeconds)) ? Number(project.scriptLengthSeconds) : 30;
  const prompt = `You are Helix, a short-form science and technology Reel director. Create a complete scene-by-scene storyboard for a ${length}-second vertical video. Use the supplied research only; do not invent facts. The storyboard must explain the mechanism clearly and keep the selected framework and tone. Each scene needs a concise spoken line, a reason that line belongs, a reason for the picture, and a concrete B-roll search phrase suitable for Pexels.

Return ONLY valid JSON with this exact shape:
{"scenes":[{"title":"...","spoken_text":"...","duration_seconds":4,"why_line":"...","why_picture":"...","broll_search_term":"..."}]}

Rules:
- 4 to 8 scenes.
- Sum duration_seconds to approximately the requested length (within 1 second).
- Spoken text should sound natural aloud and fit the scene duration.
- Start with a strong hook; finish with a clear takeaway or question.
- Do not put citations inside spoken_text.
- B-roll terms should describe visible subjects/actions, not abstract claims.
- The selected framework is ${project.selectedFramework || "how-it-works"}; tone is ${project.tone || "Conversational"}; audience is ${project.audienceLevel || "General public"}.

Signal:
${JSON.stringify({ title: signal.title, description: signal.description, category: signal.category })}

Research brief:
${project.researchSummary || "No research summary available."}

Research sources:
${JSON.stringify(project.researchSources || [])}`;

  const result = await callGemini(prompt);
  const rawScenes = Array.isArray(result.scenes) ? result.scenes : [];
  if (rawScenes.length < 4) throw new Error("Gemini returned too few storyboard scenes.");
  return rawScenes.slice(0, 8).map((scene, index) => normalizeScene(scene, index, length));
}
