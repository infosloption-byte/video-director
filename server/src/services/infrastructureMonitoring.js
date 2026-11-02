import { readFile } from "node:fs/promises";
import { prisma } from "../db/client.js";
import { cpuPercent, readContainerResourceSnapshot, sampleSource } from "./containerResourceReader.js";

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

let lastSnapshot = null;
let lastAt = null;
let lastNodeCpu = process.cpuUsage();

export async function sampleApiContainer() {
  const now = process.hrtime.bigint();
  const processCpu = process.cpuUsage();
  const snapshot = await readContainerResourceSnapshot();
  const elapsedMs = lastAt === null ? null : Number(now - lastAt) / 1e6;

  let pct = cpuPercent(lastSnapshot, snapshot, elapsedMs);
  if (snapshot.cpuUsageUs === null && lastAt !== null && elapsedMs > 0) {
    // Explicitly labeled fallback, not the Chrome-inclusive container metric.
    const deltaUs = processCpu.user - lastNodeCpu.user + processCpu.system - lastNodeCpu.system;
    pct = Math.max(0, Math.round((deltaUs / 1000 / elapsedMs) * 1000) / 10);
  }
  lastAt = now;
  lastSnapshot = snapshot;
  lastNodeCpu = processCpu;

  return {
    host: "lightsail-api",
    source: sampleSource(snapshot.cpuSource, snapshot.memorySource),
    collectedAt: new Date(),
    cpuPct: pct,
    ramUsedBytes: snapshot.ramUsedBytes ?? BigInt(process.memoryUsage().rss),
    ramTotalBytes: snapshot.ramTotalBytes,
  };
}
export async function recordApiSample() {
  const data = await sampleApiContainer();
  await prisma.infrastructureSample.create({ data });
  return data;
}

let lastCleanupDay = "";
export function startInfrastructureSampling() {
  if (process.env.INFRA_SAMPLING_ENABLED === "false") return null;
  const tick = async () => {
    try {
      await recordApiSample();
      const cutoff = new Date(Date.now() - 7 * 86400000);
      // Sample retention: daily, avoiding a growing history on 4 GiB Lightsail.
      const today = new Date().toISOString().slice(0, 10);
      if (lastCleanupDay !== today) {
        lastCleanupDay = today;
        await prisma.infrastructureSample.deleteMany({ where: { collectedAt: { lt: cutoff } } });
      }
    } catch (error) { console.warn("[monitor] Sample unavailable:", error?.code || error?.message); }
  };
  const handle = setInterval(() => { void tick(); }, 60000);
  handle.unref();
  void tick();
  return handle;
}
export async function getInfrastructureHistory(days = 7) {
  const safeDays = [1, 7].includes(Number(days)) ? Number(days) : 7;
  const since = new Date(Date.now() - safeDays * 86400000);
  const resolutionMinutes = safeDays === 1 ? 1 : 15;
  const batches = await Promise.all(["lightsail-api", "gpu-ec2"].map(host =>
    prisma.infrastructureSample.findMany({
      where: { host, collectedAt: { gte: since } },
      orderBy: { collectedAt: "desc" }, take: 11000,
    })
  ));
  // Latest reading + independent interval peaks. This prevents averaging
  // away or silently dropping the CPU/memory spikes caused by Remotion.
  const buckets = new Map();
  const max = (a, b) => a == null ? b : b == null ? a : a > b ? a : b;
  for (const sample of batches.flat()) {
    const key = sample.host + ":" + Math.floor(sample.collectedAt.getTime() / (resolutionMinutes * 60000));
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        newest: sample, peakCpuPct: sample.cpuPct,
        peakRamUsedBytes: sample.ramUsedBytes, peakGpuPct: sample.gpuPct,
      });
    } else {
      existing.peakCpuPct = max(existing.peakCpuPct, sample.cpuPct);
      existing.peakRamUsedBytes = max(existing.peakRamUsedBytes, sample.ramUsedBytes);
      existing.peakGpuPct = max(existing.peakGpuPct, sample.gpuPct);
    }
  }
  const groups = [...buckets.values()].sort((a, b) => b.newest.collectedAt - a.newest.collectedAt);
  return {
    days: safeDays, collectedAt: new Date().toISOString(),
    truncated: batches.some(batch => batch.length === 11000),
    resolutionMinutes,
    samples: groups.map(({ newest: s, peakCpuPct, peakRamUsedBytes, peakGpuPct }) => ({
      host: s.host, source: s.source, collectedAt: s.collectedAt,
      cpuPct: s.cpuPct, peakCpuPct,
      ramUsedBytes: s.ramUsedBytes == null ? null : Number(s.ramUsedBytes),
      peakRamUsedBytes: peakRamUsedBytes == null ? null : Number(peakRamUsedBytes),
      ramTotalBytes: s.ramTotalBytes == null ? null : Number(s.ramTotalBytes),
      gpuPct: s.gpuPct, peakGpuPct,
      vramUsedBytes: s.vramUsedBytes == null ? null : Number(s.vramUsedBytes),
      vramTotalBytes: s.vramTotalBytes == null ? null : Number(s.vramTotalBytes),
      temperatureC: s.temperatureC,
    })),
    definitions: {
      lightsail: "Lightsail API Docker container: cgroup CPU usage and memory (including Remotion/Chromium child processes) when available. When unavailable, the row source explicitly labels a Node-process-only fallback. NOT total host load or RAM of other apps.",
      gpu: "GPU EC2 sampled by the optional authenticated outbound nvidia-smi reporter. GPU 0% is expected when no GPU workload runs.",
      frequency: "One raw API sample each 60s. 1-day view uses 1-minute intervals; 7-day view uses 15-minute intervals and preserves CPU/RAM/GPU peaks for each interval. 7-day retention.",
    },
  };
}
