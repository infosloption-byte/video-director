import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(
  fileURLToPath(new URL("../src/routes/productivity.js", import.meta.url)),
  "utf8"
);

function route(pattern) {
  assert.match(source, new RegExp(pattern));
}

test("M15 exposes the complete version snapshot and restore API", () => {
  route('router\\.get\\("/:id/versions"');
  route('router\\.post\\("/:id/versions"');
  route('router\\.post\\("/:id/restore/:versionId"');
  assert.match(source, /versionNumber: \(latest\?\.versionNumber \|\| 0\) \+ 1/);
  assert.match(source, /timeline: jsonClone\(project\.editor\.timeline\)/);
  assert.match(source, /expectedVersion !== project\.editor\.version/);
  assert.match(source, /res\.status\(409\)\.json\(\{ error: "Editor changed elsewhere\./);
  assert.match(source, /version: \{ increment: 1 \}/);
  assert.match(source, /"version\.created"/);
  assert.match(source, /"version\.restored"/);
});

test("M15 project duplication copies scenes/assets/editor and remaps timeline references", () => {
  route('router\\.post\\("/:id/duplicate"');
  assert.match(source, /await prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(source, /tx\.projectScene\.create/);
  assert.match(source, /tx\.sceneAsset\.create/);
  assert.match(source, /sceneMap\.set\(scene\.id, copiedScene\.id\)/);
  assert.match(source, /assetMap\.set\(asset\.id, copiedAsset\.id\)/);
  assert.match(source, /sceneMap\.has\(clip\.sourceId\)/);
  assert.match(source, /assetMap\.has\(clip\.assetId\)/);
  assert.match(source, /tx\.projectEditor\.create/);
  assert.match(source, /"project\.duplicated"/);
});

test("M15 template API enforces ownership and validates template names", () => {
  route('router\\.get\\("/templates"');
  route('router\\.post\\("/templates"');
  route('router\\.delete\\("/templates/:templateId"');
  route('router\\.post\\("/:id/template"');
  assert.match(source, /if \(!name\) return res\.status\(400\)/);
  assert.match(source, /where: \{ id: req\.params\.templateId, userId: req\.user\.id \}/);
  assert.match(source, /timeline: jsonClone\(project\.editor\.timeline\)/);
  assert.match(source, /res\.status\(204\)\.end\(\)/);
  assert.match(source, /"template\.created"/);
});

test("M15 review links support creation, public reads, expiry, revocation and comments", () => {
  route('router\\.post\\("/:id/review-links"');
  route('router\\.get\\("/review/:token"');
  route('router\\.post\\("/review/:token/comments"');
  route('router\\.patch\\("/review/:token/comments/:commentId"');
  route('router\\.delete\\("/:id/review-links/:reviewId"');
  assert.match(source, /crypto\.randomBytes\(24\)\.toString\("hex"\)/);
  assert.match(source, /review\.revokedAt/);
  assert.match(source, /review\.expiresAt && review\.expiresAt < new Date\(\)/);
  assert.match(source, /if \(!body\) return res\.status\(400\)/);
  assert.match(source, /body: body\.slice\(0, 2000\)/);
  assert.match(source, /authorName: String\(req\.body\?\.authorName \|\| "Reviewer"\)\.slice\(0, 120\)/);
  assert.match(source, /resolved: req\.body\?\.resolved == null \? comment\.resolved : Boolean\(req\.body\.resolved\)/);
  assert.match(source, /revokedAt: new Date\(\)/);
});

test("M15 activity history is recorded for version, duplication, template and review actions", () => {
  route('router\\.get\\("/:id/activity"');
  assert.match(source, /async function logActivity\(projectId, userId, action, metadata = \{\}\)/);
  assert.match(source, /prisma\.projectActivity\.create\(\{ data: \{ projectId, userId, action, metadata \} \}\)/);
  for (const action of [
    "version.created",
    "version.restored",
    "project.duplicated",
    "template.created",
    "review_link.created",
    "review.comment.created",
  ]) {
    assert.match(source, new RegExp(`"${action}"`));
  }
  assert.match(source, /orderBy: \{ createdAt: "desc" \}, take: 100/);
});

test("M15 project-scoped APIs consistently require the authenticated project owner", () => {
  const projectScopedHandlers = [
    'router\\.get\\("/:id/versions"',
    'router\\.post\\("/:id/versions"',
    'router\\.post\\("/:id/restore/:versionId"',
    'router\\.post\\("/:id/duplicate"',
    'router\\.post\\("/:id/template"',
    'router\\.post\\("/:id/review-links"',
    'router\\.delete\\("/:id/review-links/:reviewId"',
    'router\\.get\\("/:id/activity"',
  ];
  for (const handler of projectScopedHandlers) {
    const index = source.search(new RegExp(handler));
    assert.notEqual(index, -1, `missing route ${handler}`);
    const body = source.slice(index, source.indexOf("\n});", index) + 4);
    assert.match(body, /projectOr404\(req\.params\.id, req\.user\.id\)/);
  }
});
