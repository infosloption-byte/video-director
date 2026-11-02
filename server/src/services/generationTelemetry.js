import { prisma } from "../db/client.js";

// Never persist customer prompts, source URLs, audio, API keys or error stacks.
// Missing spend is NULL, not a fabricated $0.00.
const stages = new Set(["research", "storyboard", "narration", "render", "editor_render", "voice", "export", "other"]);
const statuses = new Set(["completed", "failed", "cancelled"]);
const clean = (value, max) => typeof value === "string" ? value.slice(0, max) : null;
const nonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function normalizeTrace(input) {
  const stage = clean(input.stage, 50);
  if (!stages.has(stage)) throw new Error("Invalid telemetry stage");
  if (!statuses.has(input.status)) throw new Error("Invalid telemetry status");
  const startedAt = input.startedAt instanceof Date ? input.startedAt : new Date(input.startedAt);
  const finishedAt = input.finishedAt instanceof Date ? input.finishedAt : new Date(input.finishedAt);
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(finishedAt.getTime()) || finishedAt < startedAt) {
    throw new Error("Invalid telemetry timestamps");
  }
  const durationMs = Math.max(0, Math.round(finishedAt.getTime() - startedAt.getTime()));
  const price = input.costUsd;
  const costUsd = price == null ? null : Number(price);
  if (costUsd !== null && (!Number.isFinite(costUsd) || costUsd < 0)) throw new Error("Invalid cost amount");
  if (costUsd != null && !["provider_reported", "verified_invoice"].includes(input.costSource)) {
    throw new Error("Cost requires a verifiable source; never infer actual spend");
  }
  return {
    projectId: clean(input.projectId, 64),
    userId: clean(input.userId, 64),
    stage,
    operation: clean(input.operation, 80) || stage,
    status: input.status,
    provider: clean(input.provider, 50),
    model: clean(input.model, 100),
    startedAt,
    finishedAt,
    durationMs,
    inputTokens: nonNegativeInteger(input.inputTokens),
    outputTokens: nonNegativeInteger(input.outputTokens),
    costUsd,
    costSource: costUsd == null ? null : input.costSource,
    metadata: input.metadata && typeof input.metadata === "object"
      ? Object.fromEntries(Object.entries(input.metadata).filter(([key, value]) =>
          ["sceneCount", "outputSeconds", "sourceCount", "retry", "jobType", "stage"].includes(key) &&
          (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        ))
      : undefined,
  };
}

export async function recordGenerationTrace(input) {
  try {
    return await prisma.generationTrace.create({ data: normalizeTrace(input) });
  } catch (error) {
    // Telemetry must not make a paid generation fail after rendering succeeded.
    console.warn("[analytics] Failed to record generation trace:", error?.code || error?.message);
    return null;
  }
}

export async function measureGeneration(input, task) {
  const startedAt = new Date();
  let status = "completed";
  try {
    return await task();
  } catch (error) {
    status = "failed";
    throw error;
  } finally {
    await recordGenerationTrace({ ...input, status, startedAt, finishedAt: new Date() });
  }
}
