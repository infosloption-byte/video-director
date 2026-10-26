import test from "node:test";
import assert from "node:assert/strict";

// Keep Vite's fixture middleware and proxy disabling tied to the same
// Playwright environment flag; otherwise /api/* falls through to index.html.
test("browser-test API fixtures return JSON and cannot proxy to Express", async () => {
  const previous = process.env.VOXORA_E2E_MOCK_API;
  try {
    process.env.VOXORA_E2E_MOCK_API = "true";
    const { default: testConfig } = await import("../vite.config.js?test=mocked");
    assert.equal(testConfig.server.proxy, undefined);
    const fixture = testConfig.plugins.flat(Infinity).find(plugin => plugin?.name === "voxora-e2e-isolated-api");
    assert.ok(fixture, "the test environment must register the API fixture middleware");

    let middleware;
    fixture.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
    assert.equal(typeof middleware, "function");

    async function request(url, method = "GET") {
      return await new Promise((resolve, reject) => {
        const res = {
          statusCode: 200,
          headers: {},
          setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
          end(body) { resolve({ status: this.statusCode, contentType: this.headers["content-type"], body: JSON.parse(body) }); },
        };
        middleware({ url, method }, res, () => reject(new Error("Unexpected Vite HTML fallback")));
      });
    }

    const expected = [
      ["/api/projects", "projects", []],
      ["/api/signals?page=1", "signals", []],
      ["/api/health/integrations", "warnings", []],
    ];
    for (const [path, key, value] of expected) {
      const response = await request(path);
      assert.equal(response.status, 200, path);
      assert.equal(response.contentType, "application/json", path);
      assert.deepEqual(response.body[key], value, path);
    }

    const missing = await request("/api/no-such-test-endpoint");
    assert.equal(missing.status, 503);
    assert.match(missing.body.error, /Unmocked browser-test API request/);

    // Normal development is unchanged: /api remains proxied to Express.
    delete process.env.VOXORA_E2E_MOCK_API;
    const { default: devConfig } = await import("../vite.config.js?test=development");
    assert.equal(devConfig.server.proxy["/api"].target, "http://localhost:4000");
    assert.equal(devConfig.plugins.flat(Infinity).some(plugin => plugin?.name === "voxora-e2e-isolated-api"), false);
  } finally {
    if (previous === undefined) delete process.env.VOXORA_E2E_MOCK_API;
    else process.env.VOXORA_E2E_MOCK_API = previous;
  }
});
