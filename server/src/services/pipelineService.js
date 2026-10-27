import { prisma } from "../db/client.js";
import { CLASSIC_PIPELINE_DEFINITION, validatePipelineDefinition } from "./pipelineRegistry.js";

export class PipelineProblem extends Error {
  constructor(status, message, details = []) { super(message); this.status = status; this.details = details; }
}
const fail = (status, message, details = []) => { throw new PipelineProblem(status, message, details); };
const maxName = (raw, max, field) => {
  if (typeof raw !== "string" || raw.trim().length < 3 || raw.trim().length > max) fail(400, field + " must be 3–" + max + " characters.");
  return raw.trim();
};
function validDefinition(definition) {
  const validation = validatePipelineDefinition(definition);
  if (!validation.valid) fail(400, "Invalid pipeline definition.", validation.errors);
  return validation;
}
async function audit(tx, actorId, action, before, after) {
  await tx.adminAuditLog.create({ data: { actorUserId: actorId, action, metadata: { before, after } } });
}

/** Single-row FK pointer prevents two pipeline versions being simultaneously active. */
export async function getActivePipelineVersion(db = prisma) {
  const active = await db.activeAiPipeline.findUnique({ where: { id: "global" }, include: { version: true } });
  if (!active?.version || active.version.status !== "published") fail(503, "Active pipeline is not initialized. Apply the pipeline migration.");
  return active.version;
}

export async function listPipelines(db = prisma) {
  const [active, pipelines] = await Promise.all([
    db.activeAiPipeline.findUnique({ where: { id: "global" }, select: { versionId: true } }),
    db.aiPipeline.findMany({ orderBy: [{ updatedAt: "desc" }], include: { versions: { orderBy: { version: "desc" } } } }),
  ]);
  return { activeVersionId: active?.versionId ?? null, pipelines };
}

export async function createPipeline(input, actorId, db = prisma) {
  const name = maxName(input?.name, 120, "Pipeline name");
  if (input.description != null && (typeof input.description !== "string" || input.description.length > 500)) fail(400, "Description exceeds 500 characters.");
  const description = String(input.description || "").trim();
  validDefinition(CLASSIC_PIPELINE_DEFINITION);
  return db.$transaction(async tx => {
    const pipeline = await tx.aiPipeline.create({ data: {
      name, description,
      versions: { create: { version: 1, status: "draft", definition: CLASSIC_PIPELINE_DEFINITION } },
    }, include: { versions: true } });
    await audit(tx, actorId, "pipeline.created", null, { pipelineId: pipeline.id, version: 1, name });
    return pipeline;
  });
}

export async function createDraft(pipelineId, actorId, db = prisma) {
  return db.$transaction(async tx => {
    const existing = await tx.aiPipeline.findUnique({
      where: { id: pipelineId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!existing) fail(404, "Pipeline not found.");
    const latest = existing.versions[0];
    if (!latest) fail(409, "Pipeline has no version.");
    if (latest.status === "draft") fail(409, "Finish or publish the existing draft first.");
    const draft = await tx.aiPipelineVersion.create({
      data: { pipelineId, version: latest.version + 1, definition: latest.definition, status: "draft" },
    });
    await audit(tx, actorId, "pipeline.draft.created", { versionId: latest.id }, { versionId: draft.id });
    return draft;
  });
}
export async function updateDraft(versionId, pipelineId, definition, actorId, db = prisma) {
  const validation = validDefinition(definition);
  const record = await db.$transaction(async tx => {
    const before = await tx.aiPipelineVersion.findUnique({ where: { id: versionId } });
    if (!before || before.pipelineId !== pipelineId) fail(404, "Version not found.");
    if (before.status !== "draft") fail(409, "Published pipeline versions are immutable. Create a new draft.");
    const outcome = await tx.aiPipelineVersion.updateMany({
      where: { id: versionId, pipelineId, status: "draft" }, data: { definition },
    });
    if (outcome.count !== 1) fail(409, "Draft changed while saving. Refresh and retry.");
    await audit(tx, actorId, "pipeline.draft.updated", { versionId, definition: before.definition }, { versionId, definition });
    return tx.aiPipelineVersion.findUnique({ where: { id: versionId } });
  });
  return { version: record, validation };
}
export async function publishVersion(versionId, pipelineId, actorId, db = prisma) {
  return db.$transaction(async tx => {
    const version = await tx.aiPipelineVersion.findUnique({ where: { id: versionId } });
    if (!version || version.pipelineId !== pipelineId) fail(404, "Version not found.");
    if (version.status !== "draft") fail(409, "Only drafts can be published.");
    const validation = validDefinition(version.definition);
    const changed = await tx.aiPipelineVersion.updateMany({ where: { id: versionId, pipelineId, status: "draft" },
      data: { status: "published", publishedAt: new Date() } });
    if (changed.count !== 1) fail(409, "Version was already published.");
    await audit(tx, actorId, "pipeline.version.published", null, { pipelineId, versionId, version: version.version });
    return { versionId, validation };
  });
}
export async function activateVersion(versionId, pipelineId, actorId, db = prisma) {
  return db.$transaction(async tx => {
    const version = await tx.aiPipelineVersion.findUnique({ where: { id: versionId } });
    if (!version || version.pipelineId !== pipelineId) fail(404, "Version not found.");
    if (version.status !== "published") fail(409, "Only published versions can be activated.");
    validDefinition(version.definition);
    const previous = await tx.activeAiPipeline.findUnique({ where: { id: "global" } });
    if (!previous) fail(503, "Active pipeline pointer is missing. Apply migrations.");
    if (previous.versionId === version.id) return { activeVersionId: version.id, alreadyActive: true };
    await tx.activeAiPipeline.update({ where: { id: "global" }, data: { versionId: version.id } });
    await audit(tx, actorId, "pipeline.activated", { versionId: previous.versionId }, { versionId: version.id });
    return { activeVersionId: version.id, alreadyActive: false };
  });
}
