import { expect, test, type Page } from "@playwright/test";
import { decodesToEnd, isCloseColor, probeVideo, samplePixel } from "./support/inspectVideo";
import { uploadInOrder } from "./support/uploadInOrder";
import { videoPath } from "./support/videos";

const RED: [number, number, number] = [255, 0, 0];
const GREEN: [number, number, number] = [0, 128, 0];
const BLUE: [number, number, number] = [0, 0, 255];

test.setTimeout(120_000);

async function mergeAndDownload(page: Page, savePath: string) {
  await page.getByRole("button", { name: "結合する" }).click();
  const link = page.getByRole("link", { name: "ダウンロード" });
  await expect(link).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^merged-\d{8}-\d{6}\.mp4$/);
  await download.saveAs(savePath);
}

test("並べ替えた順番どおりに結合され、最後まで再生できる動画をダウンロードできる", async ({ page }, testInfo) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("green.mp4"), videoPath("blue.mp4")]);

  await page.getByRole("button", { name: "blue.mp4 を先頭へ" }).click();
  const items = page.getByRole("list", { name: "結合リスト" }).getByRole("listitem");
  await expect(items.nth(0)).toContainText("blue.mp4");
  const saved = testInfo.outputPath("merged.mp4");
  await mergeAndDownload(page, saved);

  const colors = [0.5, 1.5, 2.5].map((t) => samplePixel(saved, t, 160, 90));
  expect(colors.map((c, i) => isCloseColor(c, [BLUE, RED, GREEN][i]))).toEqual([true, true, true]);
  const decoded = decodesToEnd(saved);
  expect(decoded.stderr).toBe("");
  expect(decoded.ok).toBe(true);
  const info = probeVideo(saved);
  expect(Math.abs(info.durationSeconds - 3)).toBeLessThanOrEqual(1 / 30 + 0.03);
  expect([info.width, info.height]).toEqual([320, 180]);
});

test("横長と縦長を結合すると、幅と高さそれぞれの最大値の動画になる", async ({ page }, testInfo) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("portrait.mp4")]);
  const saved = testInfo.outputPath("merged.mp4");

  await mergeAndDownload(page, saved);

  const info = probeVideo(saved);
  expect([info.width, info.height]).toEqual([320, 320]);
});
