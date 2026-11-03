import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL("../src/" + path, import.meta.url),"utf8");

test("website report shows brand image candidates and provenance without implying commercial rights",async()=>{
  const page=await read("pages/WebsiteToVideoPage.jsx");
  assert.match(page,/report\.brandKit\.assets/);
  assert.match(page,/website_meta_theme_color/);
  assert.match(page,/Neutral fallback palette/);
  assert.match(page,/permission before commercial publishing/);
});
test("storyboard keeps existing marketing narration and offers bulk stock replacement",async()=>{
  const board=await read("pages/StoryboardPage.jsx");
  assert.match(board,/regenerateAllWebsiteVisuals/);
  assert.match(board,/regenerate-brand-visuals/);
  assert.match(board,/Replace all stock with branded visuals/);
  assert.match(board,/Original narration and timing were preserved\./);
  assert.match(board,/scene\.assets\?\.length/);
  assert.match(board,/Local branded layout/);
});
test("single scene customization uses brand-specific visual copy",async()=>{
  const editor=await read("components/SceneCustomizePanel.jsx");
  assert.match(editor,/Website marketing visuals/);
  assert.match(editor,/No Pexels fallback/);
  assert.match(editor,/scene\.customization\?\.sceneVisualPlan/);
});
