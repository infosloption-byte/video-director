import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

test("project ownership middleware compares the project owner with the authenticated user", async () => {
  const ownership = await source("../src/middleware/ownership.js");
  assert.match(ownership, /project\.userId\s*!==\s*getRequestUserId\(req\)/);
  assert.match(ownership, /res\.status\(403\)/);
});

test("render routes are protected by project ownership middleware", async () => {
  const routes = await source("../src/routes/render.js");
  assert.match(routes, /router\.use\("\/projects\/:id",\s*requireProjectOwner\)/);
});

test("editor render routes are protected by project ownership middleware", async () => {
  const routes = await source("../src/routes/editorRender.js");
  assert.match(routes, /router\.use\("\/projects\/:id",\s*requireProjectOwner\)/);
});

test("render cancellation is inside the protected project route scope", async () => {
  const routes = await source("../src/routes/render.js");
  assert.match(routes, /router\.use\("\/projects\/:id",\s*requireProjectOwner\)[\s\S]*router\.post\("\/projects\/:id\/render\/cancel"/);
});

test("editor render cancellation is inside the protected project route scope", async () => {
  const routes = await source("../src/routes/editorRender.js");
  assert.match(routes, /router\.use\("\/projects\/:id",\s*requireProjectOwner\)[\s\S]*router\.post\("\/projects\/:id\/editor\/render\/cancel"/);
});
