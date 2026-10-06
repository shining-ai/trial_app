import { expect, test } from "@playwright/test";

test("トップ画面を開くと見出しにアプリ名「動画結合アプリ」が見える", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("動画結合アプリ");
});
