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
  assert.match(routes, /requireProjectOwner/);
});

test("editor render routes are protected by project ownership middleware", async () => {
  const routes = await source("../src/routes/editorRender.js");
  assert.match(routes, /requireProjectOwner/);
});

test("render cancellation endpoint is not allowed to bypass ownership checks", async () => {
  const routes = await source("../src/routes/render.js");
  assert.match(routes, /render\/cancel/);
  assert.match(routes, /requireProjectOwner/);
});

test("editor render cancellation endpoint is not allowed to bypass ownership checks", async () => {
  const routes = await source("../src/routes/editorRender.js");
  assert.match(routes, /editor\/render\/cancel/);
  assert.match(routes, /requireProjectOwner/);
});
