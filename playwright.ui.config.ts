import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath: "/opt/google/chrome/chrome",
      args: ["--no-sandbox"],
    },
  },
});
