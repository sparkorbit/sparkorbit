import { defineConfig } from "@playwright/test";

const frontendPort = Number(process.env.SPARKORBIT_PLAYWRIGHT_FRONTEND_PORT || 4273);
const backendPort = Number(process.env.SPARKORBIT_FIXTURE_PORT || 8877);
const viteDevCommand = `npx -y node@20 node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${frontendPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "python3 scripts/serve_fixture_backend.py",
      url: `http://127.0.0.1:${backendPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        SPARKORBIT_FIXTURE_HOST: "127.0.0.1",
        SPARKORBIT_FIXTURE_PORT: String(backendPort),
        SPARKORBIT_FIXTURE_RUN_IDS: "2026-03-25T150713Z_data-test",
      },
    },
    {
      command: viteDevCommand,
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        SPARKORBIT_API_PROXY: `http://127.0.0.1:${backendPort}`,
      },
    },
  ],
});
