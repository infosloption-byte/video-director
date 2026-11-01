import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = () => readFile(new URL("../src/components/FinalizePanel.jsx", import.meta.url), "utf8");
const storyboard = () => readFile(new URL("../src/pages/StoryboardPage.jsx", import.meta.url), "utf8");

test("Preview explains why rendering is disabled and provides recheck/repair actions", async () => {
  const src = await panel();
  assert.match(src, /narration-render-blocker/);
  assert.match(src, /Recheck narration/);
  assert.match(src, /Generate missing narration/);
  assert.match(src, /aria-describedby=\{!narrationReady \? "narration-render-blocker"/);
  assert.match(src, /!narrationReady \|\| narrationChecking \|\| narrationRepairing/);
});

test("Preview uses authoritative server status, not client-only timestamps", async () => {
  const src = await panel();
  assert.match(src, /const narrationReady = narrationStatus\?\.ready === true/);
  assert.doesNotMatch(src, /setNarrationReady\(scenes\.length > 0/);
  assert.match(src, /\/repair-narration/);
  assert.match(src, /onNarrationUpdated\?\.\(data\.updatedScenes\)/);
});

test("Storyboard shows per-scene narration status and refreshes repaired scenes", async () => {
  const src = await storyboard();
  assert.match(src, /narrationSummary\.readyScenes/);
  assert.match(src, /missingNarrationOrders\.join/);
  assert.match(src, /onNarrationUpdated=\{\(updatedScenes\)/);
});
