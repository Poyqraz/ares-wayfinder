import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "perf",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 900 },
    headless: false,
    channel: "chrome",
  },
  outputDir: "test-results",
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
