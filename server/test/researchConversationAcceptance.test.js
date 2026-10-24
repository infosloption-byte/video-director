import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeConversationMarkdown } from "../src/services/researchConversationService.js";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

test("M18 conversation streams per-message research activity and discovered sources", async (t) => {
  const route = await source("../src/routes/researchConversations.js");
  const page = await source("../../frontend/src/pages/ResearchConversationPage.jsx").catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (page === null) { t.skip("Frontend sources are not part of the API Docker image; run this contract test from the full workspace."); return; }
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

test("M18 conversation generation is cancellable", async (t) => {
  const service = await source("../src/services/researchConversationService.js");
  const control = await source("../src/routes/researchControl.js");
  const page = await source("../../frontend/src/pages/ResearchConversationPage.jsx").catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (page === null) { t.skip("Frontend sources are not part of the API Docker image; run this contract test from the full workspace."); return; }
  assert.match(service, /registerResearchController/);
  assert.match(service, /RESEARCH_CONVERSATION_STOPPED/);
  assert.match(control, /conversation:\$\{project\.id\}/);
  assert.match(control, /conversationStopped: true/);
  assert.match(page, /\/api\/projects\/\$\{id\}\/research\/stop/);
  assert.match(page, /\{thinking \? "Stop" : "Ask Voxora"\}/);
});

test("M18 conversation answers allow complete multi-paragraph responses and repair truncation", async () => {
  const service = await source("../src/services/researchConversationService.js");
  assert.match(service, /MAX_OUTPUT_TOKENS = 2200/);
  assert.match(service, /looksTruncated/);
  assert.match(service, /requestModel\(model, apiKey, conversationPrompt\(topic, history, true\), signal, 2400\);/);
  assert.match(service, /4–8 short paragraphs/);
  assert.match(service, /Never stop mid-sentence, mid-word, or mid-list/);
  assert.match(service, /Return one complete, cleanly formatted response to the latest user question/);
});

test("M18 conversation answers normalize malformed Markdown before persistence", async () => {
  const service = await source("../src/services/researchConversationService.js");
  assert.match(service, /normalizeConversationMarkdown/);
  const formatted = normalizeConversationMarkdown("Summary. ## Key points\r\nOne point.");
  assert.match(formatted, /Summary\.\n\n## Key points/);
  assert.equal(normalizeConversationMarkdown("Line one\r\n\r\nLine two"), "Line one\n\nLine two");
  assert.match(service, /return normalizeConversationMarkdown\(text\)/);
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
  assert.match(route, /No new evidence was added to the corpus, so Voxora will not guess an answer/);
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
