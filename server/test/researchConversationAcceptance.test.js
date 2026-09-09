import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

test("M18 conversation streams per-message research activity and discovered sources", async () => {
  const route = await source("../src/routes/researchConversations.js");
  const page = await source("../../frontend/src/pages/ResearchConversationPage.jsx");
  assert.match(route, /router\.get\("\/:id\/events"/);
  assert.match(route, /text\/event-stream/);
  assert.match(route, /messageId/);
  assert.match(route, /recordActivity\(projectId, activity/);
  assert.match(route, /discoveredSources/);
  assert.match(route, /message\.id === messageId \+ ":assistant"/);
  assert.match(page, /new EventSource\(`/);
  assert.match(page, /addEventListener\("activity"/);
  assert.match(page, /addEventListener\("sources"/);
  assert.match(page, /Live research/);
  assert.match(page, /Sources surfaced/);
});

test("M18 follow-up research completes the pending conversation message from the persisted corpus", async () => {
  const route = await source("../src/routes/researchConversations.js");
  assert.match(route, /answerResearchQuestion\(session, question\)/);
  assert.match(route, /researchPending: false/);
  assert.match(route, /source: "research-corpus"/);
  assert.match(route, /Focused research answer is ready/);
  assert.match(route, /researchError: true/);
});
