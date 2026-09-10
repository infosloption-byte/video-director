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
  assert.match(route, /message\.id === `\$\{messageId\}:assistant`/);
  assert.match(page, /new EventSource\(`/);
  assert.match(page, /addEventListener\("activity"/);
  assert.match(page, /addEventListener\("sources"/);
  assert.match(page, /Live research/);
  assert.match(page, /Sources surfaced/);
});

test("M18 initial conversation answers the topic without duplicating the topic message", async () => {
  const route = await source("../src/routes/researchConversations.js");
  assert.match(route, /req\.body\?\.initial === true/);
  assert.match(route, /const history = initial \? currentMessages/);
  assert.match(route, /conversationThinking: true/);
  assert.match(route, /conversationThinking: false/);
});

test("M18 conversation generation is cancellable", async () => {
  const service = await source("../src/services/researchConversationService.js");
  const control = await source("../src/routes/researchControl.js");
  const page = await source("../../frontend/src/pages/ResearchConversationPage.jsx");
  assert.match(service, /registerResearchController/);
  assert.match(service, /RESEARCH_CONVERSATION_STOPPED/);
  assert.match(control, /conversation:\$\{project\.id\}/);
  assert.match(control, /conversationStopped: true/);
  assert.match(page, /\/api\/projects\/\$\{id\}\/research\/stop/);
  assert.match(page, /\{thinking \? "Stop" : "Ask Helix"\}/);
});

test("M18 follow-up research completes the pending conversation message from the persisted corpus", async () => {
  const route = await source("../src/routes/researchConversations.js");
  assert.match(route, /answerResearchQuestion\(session, question\)/);
  assert.match(route, /researchPending: false/);
  assert.match(route, /source: "research-corpus"/);
  assert.match(route, /Focused research answer is ready/);
  assert.match(route, /researchError: true/);
});

test("M18 conversation persistence and trust boundaries survive refresh", async () => {
  const route = await source("../src/routes/researchConversations.js");
  assert.match(route, /research_conversation/);
  assert.match(route, /getMessages\(project\)/);
  assert.match(route, /findFirst\(\{ where: \{ id: req\.params\.id, userId: req\.user\.id \} \}\)/);
  assert.match(route, /No new evidence was added to the corpus, so Helix will not guess an answer/);
  assert.match(route, /The existing corpus needs more evidence for this question/);
  assert.match(route, /researchPending: true/);
});

test("M18 unsupported follow-ups cannot silently become established facts", async () => {
  const memory = await source("../src/services/researchMemoryService.js");
  const route = await source("../src/routes/researchConversations.js");
  assert.match(memory, /grounded: false/);
  assert.match(memory, /No sufficiently relevant evidence was found in the stored research corpus/);
  assert.match(memory, /did not perform a web search for this follow-up/);
  assert.match(route, /I’m doing a focused research pass now rather than guessing/);
  assert.match(route, /Focused research completed; the evidence is still insufficient to answer safely/);
});
