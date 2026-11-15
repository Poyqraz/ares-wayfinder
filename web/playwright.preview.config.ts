import { defineConfig } from "@playwright/test";
import base from "./playwright.config.ts";

// Same e2e suite against the production build (pnpm build first); used for the offline-demo check.
// PREVIEW_PORT lets the suite run beside a preview someone already has open on 4173.
const port = Number(process.env.PREVIEW_PORT ?? 4173);

export default defineConfig({
  ...base,
  // Offline emulation stronger than request blocking: no host name resolves except the local server.
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}`, launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"] } },
  outputDir: "test-results/preview",
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
