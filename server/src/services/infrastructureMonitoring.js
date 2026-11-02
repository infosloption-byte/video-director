import os from "node:os";
import { readFile } from "node:fs/promises";
import { prisma } from "../db/client.js";

const MB = 1024 * 1024;
const number = (value, min, max) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const integer = (value) => {
  const n = number(value, 0, Number.MAX_SAFE_INTEGER);
  return n === null ? null : Math.round(n);
};

export function validateGpuSample(body, now = new Date()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid sample");
  const collectedAt = new Date(body.collectedAt);
  if (!Number.isFinite(collectedAt.getTime()) || Math.abs(now.getTime() - collectedAt.getTime()) > 180000) {
    throw new Error("Invalid sample timestamp");
  }
  const gpuPct = number(body.gpuPct, 0, 100);
  const vramUsedBytes = integer(body.vramUsedBytes);
  const vramTotalBytes = integer(body.vramTotalBytes);
  if (gpuPct === null || vramUsedBytes === null || vramTotalBytes === null ||
    vramTotalBytes <= 0 || vramUsedBytes > vramTotalBytes) throw new Error("Invalid GPU readings");
  return {
    host: "gpu-ec2", source: "nvidia-smi", collectedAt, gpuPct,
    vramUsedBytes: BigInt(vramUsedBytes), vramTotalBytes: BigInt(vramTotalBytes),
    temperatureC: number(body.temperatureC, 0, 120),
    cpuPct: number(body.cpuPct, 0, 100),
    ramUsedBytes: integer(body.ramUsedBytes) == null ? null : BigInt(integer(body.ramUsedBytes)),
    ramTotalBytes: integer(body.ramTotalBytes) == null ? null : BigInt(integer(body.ramTotalBytes)),
  };
}

async function readCgroupNumber(path) {
  try {
    const raw = (await readFile(path, "utf8")).trim();
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  } catch { return null; }
}

let lastCpu = process.cpuUsage();
let lastAt = process.hrtime.bigint();
export async function sampleApiContainer() {
  const now = process.hrtime.bigint();
  const cpu = process.cpuUsage();
  const elapsedMs = Number(now - lastAt) / 1e6;
  const usedMs = (cpu.user - lastCpu.user + cpu.system - lastCpu.system) / 1000;
  lastAt = now;
  lastCpu = cpu;
  const [current, max] = await Promise.all([
    readCgroupNumber("/sys/fs/cgroup/memory.current"),
    readCgroupNumber("/sys/fs/cgroup/memory.max"),
  ]);
  // The container may be allowed multiple CPU cores: percentage can exceed 100.
  const pct = elapsedMs > 0 ? Math.max(0, Math.min(4096, (usedMs / elapsedMs) * 100)) : 0;
  return {
    host: "lightsail-api", source: "node-cgroup", collectedAt: new Date(),
    cpuPct: Math.round(pct * 10) / 10,
    ramUsedBytes: BigInt(current ?? process.memoryUsage().rss),
    ramTotalBytes: max == null ? null : BigInt(max),
  };
}
export async function recordApiSample() {
  const data = await sampleApiContainer();
  await prisma.infrastructureSample.create({ data });
  return data;
}

export function startInfrastructureSampling() {
  if (process.env.INFRA_SAMPLING_ENABLED === "false") return null;
  const tick = async () => {
    try {
      await recordApiSample();
      const cutoff = new Date(Date.now() - 7 * 86400000);
      // Sample retention: daily, avoiding a growing history on 4 GiB Lightsail.
      if (new Date().getUTCHours() === 0 && new Date().getUTCMinutes() === 0)
        await prisma.infrastructureSample.deleteMany({ where: { collectedAt: { lt: cutoff } } });
    } catch (error) { console.warn("[monitor] Sample unavailable:", error?.code || error?.message); }
  };
  const handle = setInterval(() => { void tick(); }, 60000);
  handle.unref();
  void tick();
  return handle;
}
export async function getInfrastructureHistory(days = 7) {
  const safeDays = [1, 7].includes(Number(days)) ? Number(days) : 7;
  const samples = await prisma.infrastructureSample.findMany({
    where: { collectedAt: { gte: new Date(Date.now() - safeDays * 86400000) } },
    orderBy: { collectedAt: "desc" }, take: 2000,
  });
  return {
    days: safeDays, collectedAt: new Date().toISOString(),
    samples: samples.map(s => ({
      host: s.host, source: s.source, collectedAt: s.collectedAt,
      cpuPct: s.cpuPct,
      ramUsedBytes: s.ramUsedBytes == null ? null : Number(s.ramUsedBytes),
      ramTotalBytes: s.ramTotalBytes == null ? null : Number(s.ramTotalBytes),
      gpuPct: s.gpuPct,
      vramUsedBytes: s.vramUsedBytes == null ? null : Number(s.vramUsedBytes),
      vramTotalBytes: s.vramTotalBytes == null ? null : Number(s.vramTotalBytes),
      temperatureC: s.temperatureC,
    })),
    definitions: {
      lightsail: "API container CPU process usage and cgroup memory, NOT total Lightsail host load or RAM for other apps.",
      gpu: "GPU EC2 sampled by nvidia-smi only when the optional authenticated outbound reporter is configured.",
      frequency: "API sampled every 60 seconds; GPU reporter cadence configured separately; maximum 7 days retained.",
    },
  };
}
