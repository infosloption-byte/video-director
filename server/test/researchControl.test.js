import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

test("research status trusts the persisted running flag while a restarted job is reattaching", async () => {
  const researchControl = await source("../src/routes/researchControl.js");
  assert.match(researchControl, /const persistedJobActive = Boolean\(project\.researchJobRunning\);/);
  assert.match(researchControl, /!controllerActive && !persistedJobActive && !justCreated/);
});
