import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = name => readFile(new URL("../src/" + name, import.meta.url), "utf8");

test("Website to Video is a distinct protected entry point", async () => {
  const app = await read("App.jsx");
  const nav = await read("components/PlatformShell.jsx");
  assert.match(app, /path="\/website-to-video"/);
  assert.match(app, /path="\/website-to-video\/:id"/);
  assert.match(app, /ProtectedRoute/);
  assert.match(nav, /Website to Video/);
  assert.match(nav, /\/website-to-video/);
  assert.match(app, /path="\/signals"/);
  assert.match(app, /path="\/research\/new"/);
});

test("Website analysis has clear limits, source URLs and marketing concept handoff", async () => {
  const page = await read("pages/WebsiteToVideoPage.jsx");
  assert.match(page, /api\/website-analyses/);
  assert.match(page, /20 publicly accessible HTML pages/);
  assert.match(page, /sourceUrl/);
  assert.match(page, /createVideo\(idea\.id\)/);
  assert.match(page, /\/storyboard\//);
  assert.match(page, /stage=setup/);
  assert.match(page, /role="alert"/);
  assert.match(page, /No explicit promotion found/);
});
