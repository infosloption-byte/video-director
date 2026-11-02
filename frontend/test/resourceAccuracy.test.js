import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../src/" + path, import.meta.url), "utf8");

test("server resource UI identifies measurement source and interval peaks", async () => {
  const source = await read("pages/AdminMonitoringDetail.jsx");
  assert.match(source, /Measurement source: \{row\.source\}/);
  assert.match(source, /Peak CPU/);
  assert.match(source, /Peak RAM/);
  assert.match(source, /Historic rows collected before this correction/);
  assert.match(source, /data\.resolutionMinutes/);
});

test("resource dashboard keeps CPU and GPU utilization separate", async () => {
  const source = await read("pages/AdminMonitoringDetail.jsx");
  assert.match(source, /GPU utilization: \{percentage\(row\.gpuPct\)\}/);
  assert.match(source, /percentage\(row\.cpuPct\)/);
});
