import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

test("research status does not synthesize a stale-run error from missing in-memory controller state", async () => {
  const researchControl = await source("../src/routes/researchControl.js");
  assert.match(researchControl, /router\.get\("\/:id\/research", async \(req, res, next\) =>/);
  assert.match(researchControl, /return next\(\);/);
  assert.doesNotMatch(researchControl, /The previous research run is no longer active\./);
});
