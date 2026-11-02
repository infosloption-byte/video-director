import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = path => readFile(new URL("../src/" + path, import.meta.url), "utf8");

test("Website to Video is a protected route and has a sidebar entry", async () => {
  const [app, nav] = await Promise.all([file("App.jsx"), file("components/PlatformShell.jsx")]);
  assert.match(app, /path="\/website-to-video"/);
  assert.match(app, /path="\/website-to-video\/:id"/);
  assert.match(app, /<ProtectedRoute><WebsiteToVideoPage/);
  assert.match(nav, /label: "Website to Video"/);
  assert.match(nav, /path: "\/website-to-video", authOnly: true/);
  assert.match(app, /path="\/signals"/);
  assert.match(app, /path="\/research\/new"/);
});

test("website report shows evidence, limitations and gated video handoff", async () => {
  const page = await file("pages/WebsiteToVideoPage.jsx");
  assert.match(page, /\/api\/website-analyses/);
  assert.match(page, /role="status"/);
  assert.match(page, /report\.products/);
  assert.match(page, /report\.services/);
  assert.match(page, /report\.offers/);
  assert.match(page, /report\.contacts/);
  assert.match(page, /report\.pages/);
  assert.match(page, /report\.videoIdeas/);
  assert.match(page, /Source url=\{item\.sourceUrl\}/);
  assert.match(page, /\/videos"/);
  assert.match(page, /navigate\(data\.path \|\|/);
  assert.match(page, /stage=setup/);
  assert.match(page, /not automatically licensed for reuse/);
});

test("website dashboard follows the Voxora design tokens, not native controls", async () => {
  const css = await file("pages/WebsiteToVideoPage.css");
  assert.match(css, /var\(--bg-raised\)/);
  assert.match(css, /var\(--border\)/);
  assert.match(css, /var\(--ink\)/);
  assert.match(css, /@media\(max-width:780px\)/);
});
