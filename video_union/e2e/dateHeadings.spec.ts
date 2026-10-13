import { expect, test, type Page } from "@playwright/test";
import { decodesToEnd, isCloseColor, probeVideo, samplePixel } from "./support/inspectVideo";
import { uploadInOrder } from "./support/uploadInOrder";
import { videoPath } from "./support/videos";

const RED: [number, number, number] = [255, 0, 0];
const GREEN: [number, number, number] = [0, 128, 0];
const BLUE: [number, number, number] = [0, 0, 255];
const BLACK: [number, number, number] = [0, 0, 0];
const TOLERANCE = 1 / 30 + 0.03;

test.setTimeout(120_000);

function mergeSection(page: Page) {
  return page.getByRole("region", { name: "結合" });
}

function rows(page: Page) {
  return mergeSection(page).getByRole("list", { name: "結合リスト" }).getByRole("listitem");
}

async function expectOrder(page: Page, texts: string[]) {
  await expect(rows(page)).toHaveCount(texts.length);
  for (const [index, text] of texts.entries()) {
    await expect(rows(page).nth(index)).toContainText(text);
  }
}

test("撮影日時の順に並べ、撮影日ごとに見出しを入れると、その順で日付の見出しを挟んで結合される", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await uploadInOrder(page, [
    videoPath("20250805_120000.mp4"),
    videoPath("20250804_090000.mp4"),
    videoPath("20250804_180000.mp4"),
  ]);

  await mergeSection(page).getByRole("button", { name: "撮影日時の順に並べる" }).click();
  await expectOrder(page, ["20250804_090000.mp4", "20250804_180000.mp4", "20250805_120000.mp4"]);
  await mergeSection(page).getByRole("button", { name: "撮影日ごとに見出しを入れる" }).click();
  const expected = [
    "📝 2025年8月4日(1.0秒)", "20250804_090000.mp4", "20250804_180000.mp4",
    "📝 2025年8月5日(1.0秒)", "20250805_120000.mp4",
  ];
  await expectOrder(page, expected);
  // 2回押しても見出しは増えない
  await mergeSection(page).getByRole("button", { name: "撮影日ごとに見出しを入れる" }).click();
  await expectOrder(page, expected);
  await expect(mergeSection(page).getByText("合計 0:05 / 30:00", { exact: true })).toBeVisible();

  await mergeSection(page).getByRole("button", { name: "結合する" }).click();
  const link = page.getByRole("link", { name: "ダウンロード" });
  await expect(link).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const saved = testInfo.outputPath("merged.mp4");
  await (await downloadPromise).saveAs(saved);

  // 見出しの場面は黒地(四隅が黒)、動画の場面は動画の色
  const corners = [0.5, 3.5].map((t) => samplePixel(saved, t, 0, 0));
  expect(corners.map((c) => isCloseColor(c, BLACK))).toEqual([true, true]);
  const colors = [1.5, 2.5, 4.5].map((t) => samplePixel(saved, t, 160, 90));
  expect(colors.map((c, i) => isCloseColor(c, [RED, GREEN, BLUE][i]))).toEqual([true, true, true]);
  expect(Math.abs(probeVideo(saved).durationSeconds - 5)).toBeLessThanOrEqual(TOLERANCE);
  expect(decodesToEnd(saved)).toEqual({ ok: true, stderr: "" });
});
