import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { websiteAiFallbackReason, websiteVisualStatus } from "../src/utils/websiteVisualStatus.js";
const read = filename => readFile(new URL("../src/" + filename, import.meta.url), "utf8");

test("Storyboard checks capability and requires confirmation before paid Gemini image requests", async () => {
  const page = await read("pages/StoryboardPage.jsx");
  assert.match(page, /\/api\/marketing-visuals\/status/);
  assert.match(page, /aiImageStatus\.enabled/);
  assert.match(page, /provider may charge/);
  assert.match(page, /Generate AI visuals for all scenes/);
  assert.match(page, /aiVisualProgress\.done/);
  assert.match(page, /for \(const scene of pendingScenes\)/);
  assert.match(page, /confirmAiSceneImage\(scene\.id\)/);
  assert.match(page, /Provider charges may apply/);
  assert.match(page, /regenerateSceneVisuals\(scene\.id, "", "ai", \{ quiet: true \}\)/);
});

test("marketing storyboard explains local placeholders and generates only missing real AI images", async () => {
  const page = await read("pages/StoryboardPage.jsx");
  assert.match(page, /local FFmpeg starter placeholders, NOT Gemini artwork/);
  assert.match(page, /aiGeneratedCount/);
  assert.match(page, /const pendingScenes = scenes\.filter\(/);
  assert.match(page, /scene\.customization\?\.sceneVisualPlan\?\.aiStatus !== "generated"/);
  assert.match(page, /pendingScenes\.length \+ " Gemini AI image/);
  assert.match(page, /AI requests may be billable/);
  assert.match(page, /Gemini AI images are disabled or not configured/);
  assert.match(page, /aiImageStatus\.model/);
  assert.match(page, /Generate AI visuals for all scenes/);
});

test("Per-scene controls travel through StepCard to SceneCustomizePanel for website projects", async () => {
  const panel = await read("components/SceneCustomizePanel.jsx");
  const step = await read("components/StepCard.jsx");
  const page = await read("pages/StoryboardPage.jsx");
  assert.match(page, /onRegenerateAiVisuals=\{\(\) => confirmAiSceneImage\(scene\.id\)\}/);
  assert.match(page, /isWebsiteMarketing=\{Boolean\(project\?\.research\?\.sources\?\.websiteMarketing\)\}/);
  assert.match(step, /onRegenerateAiVisuals=\{onRegenerateAiVisuals\}/);
  assert.match(step, /aiImagesEnabled=\{aiImagesEnabled\}/);
  assert.match(step, /isWebsiteMarketing=\{isWebsiteMarketing\}/);
  assert.match(panel, /aiImagesEnabled && isWebsiteMarketing/);
  assert.match(panel, /onRegenerateAiVisuals\?\.\(\)/);
  assert.match(panel, /Generate AI brand image/);
  assert.match(panel, /AI illustration — not an authentic product screenshot/);
});

test("Distinct local and paid image paths show provenance and specific fallback reasons", async () => {
  const page = await read("pages/StoryboardPage.jsx");
  const step = await read("components/StepCard.jsx");
  const panel = await read("components/SceneCustomizePanel.jsx");
  assert.match(step, /Refresh local brand layout/);
  assert.match(panel, /Refresh local brand layout \(not AI\)/);
  assert.match(page, /Gemini AI was not called/);
  assert.match(page, /used local FFmpeg fallback/);
  assert.match(panel, /websiteVisualStatus/);
  assert.match(step, /websiteVisualStatus/);
  assert.match(websiteVisualStatus(null), /not an AI-generated image/);
  assert.match(websiteVisualStatus({ aiStatus: "generated", imageModel: "gemini-3.1-flash-lite-image" }), /Gemini AI-generated/);
  assert.match(websiteVisualStatus({ aiStatus: "fallback", aiFallbackCode: "IMAGE_AUTH_FAILED" }), /rejected the API key/);
  assert.match(websiteAiFallbackReason("IMAGE_RATE_LIMITED"), /quota/);
  assert.match(websiteAiFallbackReason("NOT_A_KNOWN_CODE"), /check the API logs/);
});

test("paid image bulk run stops after shared provider or quota failure", async () => {
  const page = await read("pages/StoryboardPage.jsx");
  assert.match(page, /AI_BATCH_STOP_CODES = new Set/);
  assert.match(page, /"IMAGE_RATE_LIMITED", "IMAGE_AUTH_FAILED", "IMAGE_MODEL_UNAVAILABLE"/);
  assert.match(page, /AI_BATCH_STOP_CODES\.has\(plan\.aiFallbackCode\)/);
  assert.match(page, /to avoid repeated paid requests/);
  assert.match(page, /if \(!stopped && done === pendingScenes\.length\)/);
});

test("image conversion and portrait-format failures remain understandable to users", async () => {
  assert.match(websiteAiFallbackReason("BAD_IMAGE_ASPECT_RATIO"), /aspect ratio/);
  assert.match(websiteAiFallbackReason("BAD_IMAGE_OUTPUT"), /validated after conversion/);
});

test("failed paid image requests show their reason and keep prior scene artwork", async () => {
  const page = await read("pages/StoryboardPage.jsx");
  assert.match(page, /body\?\.visualMode === "ai" && data\.code/);
  assert.match(page, /websiteAiFallbackReason\(data\.code\)/);
  assert.match(page, /Your previous scene image remains unchanged/);
});

test("Brand-first visuals avoid text collisions with Remotion caption layers", async () => {
  const page = await read("pages/StoryboardPage.jsx");
  assert.match(page, /Brand labels and narration captions remain separate/);
});
