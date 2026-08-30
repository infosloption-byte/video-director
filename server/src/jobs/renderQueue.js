import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { prisma } from "../db/client.js";
import { renderProject } from "../services/renderService.js";

const QUEUE_NAME = "helix-render";
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

export function getRenderQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: parseRedisConfig() });
    queue.on("error", (error) => console.warn(`[render] Queue Redis error: ${error.message}`));
  }
  return queue;
}

export async function enqueueRender(projectId) {
  const renderQueue = getRenderQueue();
  return renderQueue.add("render-project", { projectId }, {
    jobId: projectId,
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

export async function startRenderWorker() {
  if (worker) return worker;
  if (!redisUrl()) {
    console.log("[render] Redis is not configured; render worker is disabled.");
    return null;
  }
  if (!await canReachRedis()) {
    console.warn("[render] Redis is unavailable; render worker is disabled for this process. Start Redis and run `npm run render:worker` again.");
    return null;
  }

  const connection = workerConnection();
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { projectId } = job.data;
      await job.updateProgress({ progress: 3, stage: "preflight", stageProgress: 0, message: "Starting render preflight" });
      await prisma.project.update({ where: { id: projectId }, data: { status: "rendering" } });
      const result = await renderProject(projectId, {
        onProgress: async (state) => {
          await job.updateProgress(state);
        },
      });
      await job.updateProgress({ progress: 100, stage: "complete", stageProgress: 100, message: "Render complete" });
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

  worker.on("completed", (job) => console.log(`[render] Job ${job.id} completed.`));
  worker.on("failed", async (job, error) => {
    console.error(`[render] Job ${job?.id || "unknown"} failed:`, error);
    if (!job?.data?.projectId) return;
    // BullMQ emits "failed" for each failed attempt. Keep the project in rendering
    // while retries remain; only restore the project state after the final attempt.
    const attemptsMade = Number(job.attemptsMade || 0);
    const attempts = Number(job.opts?.attempts || 1);
    if (attemptsMade < attempts) {
      console.warn(`[render] Job ${job.id} will retry (${attemptsMade}/${attempts}).`);
      return;
    }
    await prisma.project.update({ where: { id: job.data.projectId }, data: { status: "finalize" } }).catch(() => {});
  });
  worker.on("stalled", (jobId) => console.warn(`[render] Job ${jobId} stalled; worker will attempt recovery.`));
  worker.on("error", (error) => console.error("[render] Worker error:", error));

  console.log(`[render] BullMQ worker started (lock ${Math.round(JOB_LOCK_DURATION_MS / 60000)}m).`);
  return worker;
}

if (process.argv[1] && process.argv[1].endsWith("renderQueue.js")) {
  startRenderWorker().catch((error) => console.error(`[render] Worker startup failed: ${error.message}`));
}
