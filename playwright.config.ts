import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command:
      "AUCTION_DB_PATH=:memory: SCHEDULER_INTERVAL_MS=3600000 SPAIN_BOE_SOURCE_MODE=sample OPENAI_API_KEY= TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID= npm run start -- --port 8080",
    port: 8080,
    timeout: 30_000,
    reuseExistingServer: false
  }
});
