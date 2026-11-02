import test from "node:test";
import assert from "node:assert/strict";
import {
  cpuPercent, cpuUsageFromStat,
  readContainerResourceSnapshot, sampleSource,
} from "../src/services/containerResourceReader.js";

function files(map) {
  return async path => {
    if (!Object.hasOwn(map, path)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return map[path];
  };
}

test("cgroup v2 captures total container CPU and RAM, not Node RSS", async () => {
  const snapshot = await readContainerResourceSnapshot(files({
    "/sys/fs/cgroup/cpu.stat": "usage_usec 121000000\nuser_usec 100000000\nsystem_usec 21000000\n",
    "/sys/fs/cgroup/memory.current": "2147483648\n",
    "/sys/fs/cgroup/memory.max": "max\n",
  }));
  assert.equal(snapshot.cpuSource, "cgroup-v2");
  assert.equal(snapshot.cpuUsageUs, 121000000n);
  assert.equal(snapshot.ramUsedBytes, 2147483648n);
  assert.equal(snapshot.ramTotalBytes, null);
  assert.equal(snapshot.memorySource, "cgroup-v2");
  assert.equal(sampleSource(snapshot.cpuSource, snapshot.memorySource), "cgroup-v2");
});

test("cgroup CPU usage accounts for 2 busy cores as 200 percent of one core", () => {
  const before = { cpuSource: "cgroup-v2", cpuUsageUs: 1000000n };
  const after = { cpuSource: "cgroup-v2", cpuUsageUs: 121000000n };
  assert.equal(cpuPercent(before, after, 60000), 200);
  assert.equal(cpuPercent(null, after, 60000), null);
  assert.equal(cpuPercent(before, after, 0), null);
  assert.equal(cpuPercent(before, { ...after, cpuSource: "cgroup-v1" }, 60000), null);
  assert.equal(cpuPercent(after, before, 60000), null);
});

test("cgroup v1 CPU nanoseconds and memory usage support older Docker hosts", async () => {
  const snapshot = await readContainerResourceSnapshot(files({
    "/sys/fs/cgroup/cpuacct/cpuacct.usage": "125000000000",
    "/sys/fs/cgroup/memory/memory.usage_in_bytes": "1073741824",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes": "4294967296",
  }));
  assert.equal(snapshot.cpuUsageUs, 125000000n);
  assert.equal(snapshot.ramUsedBytes, 1073741824n);
  assert.equal(snapshot.ramTotalBytes, 4294967296n);
  assert.equal(snapshot.cpuSource, "cgroup-v1");
  assert.equal(snapshot.memorySource, "cgroup-v1");
});

test("unlimited cgroup v1 memory is not misreported as a physical RAM limit", async () => {
  const snapshot = await readContainerResourceSnapshot(files({
    "/sys/fs/cgroup/cpuacct/cpuacct.usage": "125000000000",
    "/sys/fs/cgroup/memory/memory.usage_in_bytes": "1073741824",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes": "9223372036854771712",
  }));
  assert.equal(snapshot.ramTotalBytes, null);
});

test("unavailable cgroup files are transparently labeled fallback, not fake idle", async () => {
  const snapshot = await readContainerResourceSnapshot(files({}));
  assert.equal(snapshot.cpuUsageUs, null);
  assert.equal(snapshot.ramUsedBytes, null);
  assert.equal(snapshot.cpuSource, "node-process");
  assert.equal(snapshot.memorySource, "node-rss");
  assert.equal(sampleSource(snapshot.cpuSource, snapshot.memorySource), "node-process+node-rss");
  assert.equal(cpuPercent(snapshot, snapshot, 60000), null);
});

test("CPU text parsing ignores missing or malformed counters", () => {
  assert.equal(cpuUsageFromStat("usage_usec 9000\n"), 9000n);
  assert.equal(cpuUsageFromStat("system_usec 1000\n"), null);
  assert.equal(cpuUsageFromStat("usage_usec bad\n"), null);
});
