import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { prisma } from "../db/client.js";
import { renderEditorProject } from "../services/editorRenderService.js";

const QUEUE_NAME = "helix-editor-render";
const JOB_LOCK_DURATION_MS = Number(process.env.RENDER_JOB_LOCK_DURATION_MS || 30 * 60 * 1000);
let queue = null;
let worker = null;

function redisUrl() {
  return process.env.REDIS_URL?.trim() || "";
}

function parseRedisConfig() {
  const raw = redisUrl();
  if (!raw) throw new Error("Render queue is not configured. Set REDIS_URL in server/.env.");
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("Invalid REDIS_URL. Use redis://127.0.0.1:6379 or rediss://..."); }
  if (!["redis:", "rediss:"].includes(parsed.protocol)) throw new Error("Invalid REDIS_URL protocol. Use redis:// or rediss://.");
  const config = { host: parsed.hostname, port: Number(parsed.port || 6379), maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1500, retryStrategy: () => null };
  if (parsed.username) config.username = decodeURIComponent(parsed.username);
  if (parsed.password) config.password = decodeURIComponent(parsed.password);
  if (parsed.pathname && parsed.pathname !== "/") config.db = Number(parsed.pathname.slice(1));
  if (parsed.protocol === "rediss:") config.tls = {};
  return config;
}

function workerConnection() {
  const raw = redisUrl();
  if (!raw) throw new Error("Render queue is not configured. Set REDIS_URL in server/.env.");
  return new IORedis(raw, { maxRetriesPerRequest: null, connectTimeout: 3000, retryStrategy: (times) => Math.min(Math.max(times * 1000, 1000), 10000) });
}

export function getEditorRenderQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: parseRedisConfig() });
    queue.on("error", (error) => console.warn(`[editor-render] Queue Redis error: ${error.message}`));
  }
  return queue;
}

export async function enqueueEditorRender(projectId, version, renderHash) {
  const renderQueue = getEditorRenderQueue();
  const jobId = `editor-${projectId}-${version}-${renderHash}`;
  return renderQueue.add("render-editor", { projectId, version, renderHash }, {
    jobId,
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 50 },
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
  });
}

async function canReachRedis() {
  const raw = redisUrl();
  if (!raw) return false;
  const client = new IORedis(raw, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1500, retryStrategy: () => null });
  try {
    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch {
    client.disconnect();
    return false;
  }
}

export async function startEditorRenderWorker() {
  if (worker) return worker;
  if (!redisUrl()) {
    console.log("[editor-render] Redis is not configured; editor render worker is disabled.");
    return null;
  }
  if (!await canReachRedis()) {
    console.warn("[editor-render] Redis is unavailable; editor render worker is disabled for this process. Start Redis and run `npm run editor-render:worker` again.");
    return null;
  }

  const connection = workerConnection();
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { projectId, version, renderHash } = job.data;
      await job.updateProgress({ progress: 3, stage: "preflight", stageProgress: 0, message: "Starting editor render preflight" });
      const result = await renderEditorProject(projectId, version, renderHash, {
        onProgress: async (state) => { await job.updateProgress(state); },
      });
      await job.updateProgress({ progress: 100, stage: "complete", stageProgress: 100, message: "Editor render complete", ...result });
      return result;
    },
    {
      connection,
      concurrency: 1,
      lockDuration: JOB_LOCK_DURATION_MS,
      stalledInterval: 60_000,
      maxStalledCount: 2,
    },
  );

  worker.on("completed", (job) => console.log(`[editor-render] Job ${job.id} completed.`));
  worker.on("failed", async (job, error) => {
    console.error(`[editor-render] Job ${job?.id || "unknown"} failed:`, error);
    if (!job?.data?.projectId) return;
    // Do not publish a terminal failure while BullMQ still has retry attempts.
    const attemptsMade = Number(job.attemptsMade || 0);
    const attempts = Number(job.opts?.attempts || 1);
    if (attemptsMade < attempts) {
      console.warn(`[editor-render] Job ${job.id} will retry (${attemptsMade}/${attempts}).`);
      return;
    }
    await prisma.projectEditor.update({ where: { projectId: job.data.projectId }, data: { renderStatus: "failed", renderVersion: Number(job.data.version), renderHash: String(job.data.renderHash), renderError: error.message || "Editor render failed." } }).catch(() => {});
  });
  worker.on("stalled", (jobId) => console.warn(`[editor-render] Job ${jobId} stalled; worker will attempt recovery.`));
  worker.on("error", (error) => console.error("[editor-render] Worker error:", error));

  console.log(`[editor-render] BullMQ worker started (lock ${Math.round(JOB_LOCK_DURATION_MS / 60000)}m).`);
  return worker;
}

if (process.argv[1] && process.argv[1].endsWith("editorRenderQueue.js")) {
  startEditorRenderWorker().catch((error) => console.error(`[editor-render] Worker startup failed: ${error.message}`));
}
