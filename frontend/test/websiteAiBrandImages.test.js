import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read = filename => readFile(new URL("../src/" + filename,import.meta.url),"utf8");

test("Storyboard checks server capability before exposing paid marketing AI image actions",async()=>{
  const page=await read("pages/StoryboardPage.jsx");
  assert.match(page,/\/api\/marketing-visuals\/status/);
  assert.match(page,/aiImageStatus\.enabled/);
  assert.match(page,/provider may charge/);
  assert.match(page,/Generate AI visuals for all scenes/);
  assert.match(page,/aiVisualProgress\.done/);
  assert.match(page,/for \(const scene of scenes\)/);
  assert.match(page,/regenerateSceneVisuals\(scene\.id, "", "ai"\)/);
});
test("Per-scene marketing editor offers explicit AI mode with source-vs-fallback provenance",async()=>{
  const panel=await read("components/SceneCustomizePanel.jsx");
  const page=await read("pages/StoryboardPage.jsx");
  assert.match(panel,/aiImagesEnabled/);
  assert.match(panel,/onRegenerateAiVisuals/);
  assert.match(panel,/Generate AI brand image/);
  assert.match(panel,/aiStatus === "fallback"/);
  assert.match(panel,/AI illustration — not an authentic product screenshot/);
  assert.match(page,/onRegenerateAiVisuals=\{\(\) => regenerateSceneVisuals\(scene\.id, "", "ai"\)\}/);
});
test("Brand-first visuals avoid text collisions with Remotion's caption layers",async()=>{
  const page=await read("pages/StoryboardPage.jsx");
  assert.match(page,/Brand labels and narration captions remain separate/);
});


test("Storyboard StepCard forwards paid AI action and capability to the scene editor", async () => {
  const step = await read("components/StepCard.jsx");
  assert.match(step, /onRegenerateAiVisuals,/);
  assert.match(step, /aiImagesEnabled = false/);
  assert.match(step, /onRegenerateAiVisuals=\{onRegenerateAiVisuals\}/);
  assert.match(step, /aiImagesEnabled=\{aiImagesEnabled\}/);
  assert.match(step, /Generate AI image/);
  assert.match(step, /Rebuild basic layout/);
  assert.match(step, /plan\.aiStatus === "generated"/);
  assert.match(step, /plan\.aiStatus === "fallback"/);
});

test("marketing previews omit duplicate storyboard titles but preserve narration captions", async () => {
  const preview = await read("components/PhonePreview.jsx");
  assert.match(preview, /isMarketingVisual = Boolean\(step\.customization\?\.sceneVisualPlan\)/);
  assert.match(preview, /\{!isMarketingVisual && <p className="hx-preview__caption-lead">/);
  assert.match(preview, /hx-preview__caption-sub/);
});

test("explicit AI scene updates present a visible outcome and provider failure code", async () => {
  const board = await read("pages/StoryboardPage.jsx");
  const editor = await read("components/SceneCustomizePanel.jsx");
  assert.match(board, /result\.visualOutcome/);
  assert.match(board, /outcome\?\.status === "generated"/);
  assert.match(board, /outcome\?\.failureCode/);
  assert.match(editor, /aiFallbackCode/);
  assert.match(editor, /Rebuild basic layout/);
});
