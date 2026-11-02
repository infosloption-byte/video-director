import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const routes = readFileSync("src/App.jsx", "utf8");
const shell = readFileSync("src/components/AdminShell.jsx", "utf8");
const pool = readFileSync("src/pages/AdminModelPoolPage.jsx", "utf8");
const builder = readFileSync("src/pages/AdminPipelinesPage.jsx", "utf8");

test("admin model pool is protected and accessible from dedicated admin navigation", () => {
  assert.match(routes, /path="\/admin\/model-pool" element=\{<PlatformAdminRoute><AdminModelPoolPage/);
  assert.match(shell, /path: "\/admin\/model-pool", label: "AI Model Pool"/);
  assert.match(pool, /Run live test/);
});
test("admin menu is collapsible with accessible button and persisted preference", () => {
  assert.match(shell, /aria-label=\{collapsed \? "Expand admin sidebar" : "Collapse admin sidebar"\}/);
  assert.match(shell, /voxora-admin-sidebar-collapsed/);
  assert.match(shell, /is-collapsed/);
});
test("pipeline draft has capability-verified pool model choices without publishing them", () => {
  assert.match(builder, /verifiedCapabilities\.includes\(stage\.key\)/);
  // The visible warning and the Publish action must both retain the draft-only guard.
  assert.match(builder, /Pool model assignments remain draft-only\. Publishing this pipeline is blocked until a runtime adapter is integrated\./);
  assert.match(builder, /disabled=\{busy \|\| !latestPass \|\| unsaved \|\| definition\?\.stages\?\.some\(stage => stage\.modelId\)\}/);
});

test("OpenRouter cloud provider and model slug guidance are present in the registration form", () => {
  assert.match(pool, /id: "openrouter", label: "OpenRouter", type: "cloud"/);
  assert.match(pool, /provider === "openrouter"/);
  assert.match(pool, /OPENROUTER_API_KEY/);
});

test("per-model endpoint is auto-suggested, edited and sent to the backend", () => {
  assert.match(pool, /function recommendedEndpoint\(provider, modelId/);
  assert.match(pool, /provider === "openrouter"/);
  assert.match(pool, /setEndpointUrl\(recommendedEndpoint\(value, modelIdentifier\)\)/);
  assert.match(pool, /Model API endpoint URL/);
  assert.match(pool, /modelIdentifier, endpointUrl/);
  assert.match(pool, /model\.endpointUrl/);
  assert.doesNotMatch(pool, /Endpoint origin<input/);
});
