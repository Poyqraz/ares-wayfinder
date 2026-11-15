import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 900 },
    video: "on",
  },
  workers: 6, // software-rendered WebGL plus video: more workers than this starve each other and make timing tests flaky
  outputDir: "test-results",
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
