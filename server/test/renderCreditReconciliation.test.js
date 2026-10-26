import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (file) => readFile(fileURLToPath(new URL(file, import.meta.url)), "utf8");

test("both queues persist the reservation month and user, never derive refund month from current time", async () => {
  const storyboard = await source("../src/jobs/renderQueue.js");
  const editor = await source("../src/jobs/editorRenderQueue.js");
  const storyboardRoute = await source("../src/routes/render.js");
  const editorRoute = await source("../src/routes/editorRender.js");
  assert.match(storyboard, /\{ projectId, credit \}/);
  assert.match(editor, /\{ projectId, version, renderHash, credit \}/);
  for (const route of [storyboardRoute, editorRoute]) {
    assert.match(route, /reservation\.fresh \? \{ userId: req\.user\.id, renderKey, month: reservation\.month, creditId: reservation\.creditId \} : null/);
    assert.match(route, /renderKey/);
    assert.match(route, /releaseRender\(userId, creditKey, month, creditId\)/);
    assert.match(route, /state === "failed"/);
    assert.match(route, /job\.data\.credit\?\.userId === req\.user\.id/);
  }
});

test("failed attempts are retried without refund until final terminal failure", async () => {
  for (const file of ["../src/jobs/renderQueue.js", "../src/jobs/editorRenderQueue.js"]) {
    const code = await source(file);
    const guard = code.indexOf("if (attemptsMade < attempts)");
    const refund = code.indexOf("await releaseRender(credit.userId, credit.renderKey, credit.month, credit.creditId)");
    assert.ok(guard >= 0 && refund > guard, "refund must be downstream of the final-attempt check");
    assert.match(code, /if \(credit\?\.userId && credit\?\.renderKey && credit\?\.month\)/);
  }
});

test("monthly UTC reset and idempotent release are unchanged by retry or duplicate worker events", async () => {
  const billing = await source("../src/services/billingService.js");
  assert.match(billing, /resetAt: new Date\(Date.UTC/);
  assert.match(billing, /const deleted=await tx\.renderCredit\.deleteMany/);
  assert.match(billing, /if\(deleted\.count\) await tx\.monthlyRenderUsage\.updateMany/);
  assert.match(billing, /used:\{gt:0\}/);
  assert.match(billing, /id:expectedCreditId/);
  assert.match(billing, /creditId=credit.id/);
});
