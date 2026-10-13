import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  globalSetup: "./global-setup.ts",
  // e2e/ はホストからマウントしているため、成果物はコンテナ内に書き出す
  outputDir: "/tmp/playwright-results",
  reporter: "list",
  // 結合は同時に1件しか実行できない(409)ため、テストを並列に走らせない
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
