import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isBrowserTest = process.env.VOXORA_E2E_MODE === "1";

// Browser tests intentionally mock authentication/Paddle via Playwright.
// When a test navigates into the workspace, incidental background GETs can
// outlive the Playwright route fixture; serve only those fixtures locally.
// All other unmatched /api calls fail loudly instead of reaching production
// or trying a non-running developer backend on port 4000.
function isolatedBrowserTestApi() {
  return {
    name: "voxora-e2e-isolated-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const pathname = req.url.split("?")[0];
        if (req.method !== "GET") {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Unmocked browser-test API request." }));
          return;
        }
        const fixtures = {
          "/api/projects": { projects: [] },
          "/api/signals": { signals: [], pagination: { page: 1, pageSize: 12, total: 0, totalPages: 1 } },
          "/api/health/integrations": { warnings: [] },
        };
        const response = fixtures[pathname];
        res.statusCode = response ? 200 : 503;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(response || { error: "Unmocked browser-test API request." }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), ...(isBrowserTest ? [isolatedBrowserTestApi()] : [])],
  server: {
    // Standard local development keeps its real Express backend proxy.
    // E2E test processes never contact a real backend or payment provider.
    ...(isBrowserTest ? {} : {
      proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } },
    }),
  },
});
