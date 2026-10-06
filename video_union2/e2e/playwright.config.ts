import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  // e2e/ はホストからマウントしているため、成果物はコンテナ内に書き出す
  outputDir: "/tmp/playwright-results",
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
