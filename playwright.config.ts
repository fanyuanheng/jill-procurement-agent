import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry"
  },
  webServer: {
    command: "rm -f data/test-e2e.sqlite && SQLITE_PATH=data/test-e2e.sqlite DEMO_MODE=simulation LLM_PROVIDER=local LLM_BASE_URL=http://127.0.0.1:9 AGENTMAIL_WEBHOOK_SECRET= next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
