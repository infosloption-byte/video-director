import { readFile } from "node:fs/promises";

const defaultRead = path => readFile(path, "utf8");
const bigUnsigned = value => {
  const raw = String(value ?? "").trim();
  return /^\d+$/.test(raw) ? BigInt(raw) : null;
};

async function tryRead(path, reader) {
  try { return await reader(path); } catch { return null; }
}

export function cpuUsageFromStat(text) {
  const match = String(text || "").match(/^usage_usec\s+(\d+)\s*$/m);
  return match ? BigInt(match[1]) : null;
}

export function cpuPercent(previous, current, elapsedMs) {
  if (!previous || !current || !Number.isFinite(elapsedMs) || elapsedMs <= 0 ||
      previous.cpuSource !== current.cpuSource ||
      previous.cpuUsageUs == null || current.cpuUsageUs == null ||
      current.cpuUsageUs < previous.cpuUsageUs) return null;
  // Cgroup cpu.stat includes ALL processes and Chrome children, not just the Node PID.
  // 100% = one fully utilized logical CPU; multi-core containers can exceed 100%.
  const usedMs = Number(current.cpuUsageUs - previous.cpuUsageUs) / 1000;
  const result = 100 * usedMs / elapsedMs;
  return Number.isFinite(result) && result >= 0 ? Math.round(result * 10) / 10 : null;
}

export async function readContainerResourceSnapshot(reader = defaultRead) {
  let cpuUsageUs = null;
  let cpuSource = "node-process";
  const v2 = cpuUsageFromStat(await tryRead("/sys/fs/cgroup/cpu.stat", reader));
  if (v2 !== null) {
    cpuUsageUs = v2;
    cpuSource = "cgroup-v2";
  } else {
    for (const path of [
      "/sys/fs/cgroup/cpuacct/cpuacct.usage",
      "/sys/fs/cgroup/cpu,cpuacct/cpuacct.usage",
    ]) {
      const ns = bigUnsigned(await tryRead(path, reader));
      if (ns !== null) {
        cpuUsageUs = ns / 1000n;
        cpuSource = "cgroup-v1";
        break;
      }
    }
  }

  let ramUsedBytes = bigUnsigned(await tryRead("/sys/fs/cgroup/memory.current", reader));
  let ramTotalBytes = null;
  let memorySource = "node-rss";
  if (ramUsedBytes !== null) {
    memorySource = "cgroup-v2";
    ramTotalBytes = bigUnsigned(await tryRead("/sys/fs/cgroup/memory.max", reader));
  } else {
    const value = bigUnsigned(await tryRead("/sys/fs/cgroup/memory/memory.usage_in_bytes", reader));
    if (value !== null) {
      memorySource = "cgroup-v1";
      ramUsedBytes = value;
      ramTotalBytes = bigUnsigned(await tryRead("/sys/fs/cgroup/memory/memory.limit_in_bytes", reader));
    }
  }
  // Both v1's gigantic unlimited sentinel and v2's literal max mean
  // there is no configured memory cap. Do not present host RAM as a cgroup limit.
  if (ramTotalBytes !== null && ramTotalBytes >= (1n << 60n)) ramTotalBytes = null;
  return { cpuUsageUs, cpuSource, ramUsedBytes, ramTotalBytes, memorySource };
}

export function sampleSource(cpuSource, memorySource) {
  if (cpuSource === memorySource) return cpuSource;
  return [cpuSource, memorySource].join("+").slice(0, 35);
}
