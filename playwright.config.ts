import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
export default defineConfig({
  globalSetup: "./tests/e2e/setup.ts",
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: process.env.APP_ORIGIN || "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath: "/opt/google/chrome/chrome",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright-report", open: "never" }],
  ],
});
