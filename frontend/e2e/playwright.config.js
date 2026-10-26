import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.VOXORA_E2E_URL || "http://127.0.0.1:5179";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: { timeout: 10000 },
  retries: process.env.CI ? 1 : 0,
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.VOXORA_E2E_URL ? undefined : {
    command: "npm run dev -- --host 127.0.0.1 --port 5179 --strictPort",
    cwd: "..",
    url: baseURL,
    timeout: 45000,
    reuseExistingServer: !process.env.CI,
  },
});
