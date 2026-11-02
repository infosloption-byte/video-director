import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../src/" + path, import.meta.url), "utf8");

test("website report shows cleaned business identity and cited original website headline", async () => {
  const component = await read("pages/WebsiteToVideoPage.jsx");
  assert.match(component, /report\.name/);
  assert.match(component, /report\.originalHeading/);
  assert.match(component, /Website headline/);
  assert.match(component, /Visit analyzed website/);
});

test("marketing concepts include hook, focus, audience and CTA before handoff", async () => {
  const component = await read("pages/WebsiteToVideoPage.jsx");
  for(const key of ["idea.focus","idea.hook","idea.audience","idea.cta","idea.evidenceUrls"]) {
    assert.ok(component.includes(key), key);
  }
  assert.match(component, /data\.path \|\|/);
  assert.match(component, /stage=setup/);
  assert.match(component, /Create video & continue to setup/);
});

test("normal research and Signals routes remain available", async () => {
  const app = await read("App.jsx");
  assert.match(app, /path="\/signals"/);
  assert.match(app, /path="\/website-to-video"/);
  assert.match(app, /path="\/research\/new"/);
  assert.match(app, /path="\/storyboard\/:id"/);
});
