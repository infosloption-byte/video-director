import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

test("research graph API waits for persisted graph data instead of returning a transient 404", async () => {
  const app = await source("../src/app.js");
  const availability = await source("../src/services/researchGraphAvailability.js");
  assert.match(app, /waitForResearchGraph/);
  assert.match(app, /Research graph is still being saved\. Please retry shortly\./);
  assert.match(availability, /while \(!sessionId && Date\.now\(\) < deadline\)/);
  assert.match(availability, /await sleep\(intervalMs\)/);
});
