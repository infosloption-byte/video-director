import { prisma } from "../db/client.js";
import { ModelPoolError, CAPABILITIES, TESTABLE_CAPABILITIES, validateModelInput, allowedHostedOrigin, resolveModelEndpoint } from "./modelPoolValidation.js";
import { encryptCredential, configuredCredential } from "./modelPoolCredentials.js";
import { probeModelCapability } from "./modelPoolProbe.js";

const activeProbes = new Set();
const lastStarted = new Map();

function recentResults(model) {
  const latest = new Map();
  for (const item of model.tests || []) {
    if (!latest.has(item.capability)) latest.set(item.capability, item);
  }
  return [...latest.values()].map(test => ({
    id: test.id, capability: test.capability, passed: test.passed,
    current: test.modelRevision === model.revision,
    latencyMs: test.latencyMs, createdAt: test.createdAt,
    result: test.result,
  }));
}
export function safePoolModel(model) {
  const tests = recentResults(model);
  let connectionReady = configuredCredential(model);
  try {
    resolveModelEndpoint(model);
    if (model.hostingType === "hosted") connectionReady = true;
  } catch { connectionReady = false; }
  const verifiedCapabilities = model.enabled && connectionReady
    ? tests.filter(test => test.current && test.passed).map(test => test.capability)
    : [];
  return {
    id: model.id, name: model.name, hostingType: model.hostingType,
    provider: model.provider, modelIdentifier: model.modelIdentifier,
    baseUrl: model.baseUrl, endpointUrl: model.endpointUrl || null, declaredCapabilities: model.declaredCapabilities,
    enabled: model.enabled, revision: model.revision,
    credentialConfigured: connectionReady,
    hasStoredCredential: Boolean(model.encryptedCredential),
    verifiedCapabilities, tests, createdAt: model.createdAt, updatedAt: model.updatedAt,
  };
}
export async function listPool(db = prisma) {
  const models = await db.aiPoolModel.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { tests: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 } },
  });
  return { models: models.map(safePoolModel), capabilities: CAPABILITIES, liveTestable: TESTABLE_CAPABILITIES,
    hostedOriginConfigured: Boolean(String(process.env.AI_POOL_ALLOWED_ORIGINS || "").trim()),
    encryptionReady: Boolean(String(process.env.AI_POOL_ENCRYPTION_KEY || "").trim()) };
}
export async function getEligiblePoolModels(db = prisma) {
  return (await listPool(db)).models.map(model => ({
    id: model.id, name: model.name, hostingType: model.hostingType, provider: model.provider,
    enabled: model.enabled, verifiedCapabilities: model.verifiedCapabilities,
    declaredCapabilities: model.declaredCapabilities,
  }));
}
async function audit(db, actorId, action, details) {
  return db.adminAuditLog.create({ data: { actorUserId: actorId, action, metadata: details } });
}
export async function createPoolModel(input, actorId, db = prisma) {
  const value = validateModelInput(input);
  const encryptedCredential = value.apiKey ? encryptCredential(value.apiKey) : null;
  const model = await db.$transaction(async tx => {
    const created = await tx.aiPoolModel.create({ data: {
      name: value.name, hostingType: value.hostingType, provider: value.provider,
      modelIdentifier: value.modelIdentifier, baseUrl: value.baseUrl, endpointUrl: value.endpointUrl, enabled: value.enabled,
      declaredCapabilities: value.declaredCapabilities, encryptedCredential,
    } });
    await audit(tx, actorId, "ai_pool.model.created",
      { modelId: created.id, provider: created.provider, name: created.name, capabilityCount: value.declaredCapabilities.length });
    return created;
  });
  return safePoolModel({ ...model, tests: [] });
}
export async function updatePoolModel(id, input, actorId, db = prisma) {
  const value = validateModelInput(input);
  const encryptedCredential = value.apiKey ? encryptCredential(value.apiKey) : undefined;
  const model = await db.$transaction(async tx => {
    const old = await tx.aiPoolModel.findUnique({ where: { id } });
    if (!old) throw new ModelPoolError(404, "Model not found.");
    const changedProvider = old.provider !== value.provider || old.hostingType !== value.hostingType;
    if (changedProvider && !value.apiKey)
      throw new ModelPoolError(400, "Provide a new API credential when switching provider type (or create a new model).");
    const after = await tx.aiPoolModel.update({
      where: { id },
      data: { name: value.name, provider: value.provider, hostingType: value.hostingType,
        modelIdentifier: value.modelIdentifier, baseUrl: value.baseUrl, endpointUrl: value.endpointUrl, enabled: value.enabled,
        declaredCapabilities: value.declaredCapabilities, revision: { increment: 1 },
        ...(encryptedCredential === undefined ? {} : { encryptedCredential }) },
    });
    await audit(tx, actorId, "ai_pool.model.updated", { modelId: id, beforeRevision: old.revision, afterRevision: after.revision,
      oldProvider: old.provider, newProvider: after.provider });
    return after;
  });
  return safePoolModel({ ...model, tests: [] });
}
export async function testPoolCapability(id, capability, actorId, db = prisma, runProbe = probeModelCapability) {
  if (!TESTABLE_CAPABILITIES.includes(capability)) throw new ModelPoolError(409, "A live tester for this capability is not implemented yet.");
  const model = await db.aiPoolModel.findUnique({ where: { id } });
  if (!model) throw new ModelPoolError(404, "Model not found.");
  if (!model.enabled) throw new ModelPoolError(409, "Enable the model before testing.");
  if (!model.declaredCapabilities.includes(capability)) throw new ModelPoolError(400, "Capability was not declared for this model.");
  const key = id + ":" + capability;
  if (activeProbes.has(key) || Date.now() - (lastStarted.get(key) || 0) < 15000)
    throw new ModelPoolError(429, "Model test is already running or was recently started. Try again later.");
  activeProbes.add(key); lastStarted.set(key, Date.now());
  try {
    const outcome = await runProbe(model, capability);
    const result = await db.aiPoolCapabilityTest.create({
      data: { modelId: id, modelRevision: model.revision, capability, passed: outcome.passed,
        latencyMs: Math.min(60000, Math.max(0, outcome.latencyMs)), result: outcome.result },
      select: { id: true, modelRevision: true, capability: true, passed: true, latencyMs: true, result: true, createdAt: true },
    });
    await audit(db, actorId, "ai_pool.capability.tested", { modelId: id, capability, revision: model.revision, passed: outcome.passed });
    return { test: result, note: "Live, billable API test. No workspace projects or rendering credits used." };
  } finally { activeProbes.delete(key); }
}
