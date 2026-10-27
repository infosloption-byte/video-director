import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const app = readFileSync("src/App.jsx", "utf8");
const nav = readFileSync("src/components/AdminShell.jsx", "utf8");
const page = readFileSync("src/pages/AdminPipelinesPage.jsx", "utf8");

test("pipeline builder is a separate protected administrator page", () => {
  assert.match(app, /path="\/admin\/pipelines" element=\{<PlatformAdminRoute><AdminPipelinesPage/);
  assert.match(nav, /path: "\/admin\/pipelines", label: "AI Pipelines"/);
  assert.match(page, /Grok and GPU models remain unavailable/);
});
test("pipeline creation and activation are explicit admin operations", () => {
  assert.match(page, /Create draft/);
  assert.match(page, /Publish/);
  assert.match(page, /Activate globally/);
  assert.match(page, /Existing projects keep their assigned versions/);
});
