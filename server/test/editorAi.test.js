import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const editorRoute = await readFile(
  fileURLToPath(new URL("../src/routes/editor.js", import.meta.url)),
  "utf8"
);
const operations = await readFile(
  fileURLToPath(new URL("../src/services/editorOperations.js", import.meta.url)),
  "utf8"
);
const aiService = await readFile(
  fileURLToPath(new URL("../src/services/aiEditorService.js", import.meta.url)),
  "utf8"
);

function match(source, pattern) {
  assert.match(source, pattern);
}

test("M14 exposes suggestion, preview, and version-safe apply endpoints", () => {
  match(editorRoute, /router\.post\("\/:id\/editor\/ai\/suggest"/);
  match(editorRoute, /router\.post\("\/:id\/editor\/ai\/preview"/);
  match(editorRoute, /router\.post\("\/:id\/editor\/ai\/apply"/);
  match(editorRoute, /expectedVersion !== result\.editor\.version/);
  match(editorRoute, /res\.status\(409\)\.json\(\{ error: "Editor changed elsewhere\. Reload before applying AI edits\./);
});

test("M14 validates bounded reversible editor operations and protects locked narration", () => {
  match(operations, /operations\.length > 25/);
  match(operations, /regenerate_narration/);
  match(operations, /track\.id !== "narration" \|\| clip\.type !== "audio"/);
  match(operations, /assertMutable\(track\)/);
  match(operations, /source: "ai"/);
});

test("M14 keeps B-roll replacement inside the project's source scene assets", () => {
  match(editorRoute, /assetsById\.get\(String\(operation\.assetId\)\)/);
  match(editorRoute, /operation\.sourceId\) !== candidate\.sceneId/);
  match(editorRoute, /candidate\.asset\.videoUrl/);
});

test("M14 includes AI reasoning and explicit source immutability instructions", () => {
  match(aiService, /Return ONLY JSON/);
  match(aiService, /Maximum 25 operations/);
  match(aiService, /Never delete or modify source media, storyboard records, narration source records, or external assets/);
  match(aiService, /reasoning/);
});

test("M14 rate-limits AI suggestion requests and records AI activity", () => {
  match(editorRoute, /AI_WINDOW_MS = 60_000/);
  match(editorRoute, /AI_REQUEST_LIMIT = 10/);
  match(editorRoute, /checkAiRateLimit\(req\.user\.id\)/);
  match(editorRoute, /res\.status\(429\)/);
  match(editorRoute, /"ai\.suggestion\.created"/);
  match(editorRoute, /"ai\.edits\.applied"/);
});
