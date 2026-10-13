import { expect, test, type Page } from "@playwright/test";
import { brightBoundingBox, decodesToEnd, isCloseColor, probeVideo, samplePixel } from "./support/inspectVideo";
import { uploadInOrder } from "./support/uploadInOrder";
import { videoPath } from "./support/videos";

const RED: [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];
// 出力 320x180・30fps。長さの許容は ±1フレーム + AAC の分
const TOLERANCE = 1 / 30 + 0.03;

test.setTimeout(120_000);

function mergeSection(page: Page) {
  return page.getByRole("region", { name: "結合" });
}

function rows(page: Page) {
  return mergeSection(page).getByRole("list", { name: "結合リスト" }).getByRole("listitem");
}

async function enterText(page: Page, text: string, seconds: string) {
  await mergeSection(page).getByLabel("テキスト", { exact: true }).fill(text);
  await mergeSection(page).getByLabel("表示時間(秒)").fill(seconds);
  await mergeSection(page).getByRole("button", { name: "確定" }).click();
}

async function mergeAndDownload(page: Page, savePath: string) {
  await mergeSection(page).getByRole("button", { name: "結合する" }).click();
  const link = page.getByRole("link", { name: "ダウンロード" });
  await expect(link).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  await (await downloadPromise).saveAs(savePath);
}

function colorsAt(path: string, seconds: number[]) {
  return seconds.map((t) => samplePixel(path, t, 159, 89));
}

test("動画の間に挿入した見出しが、黒背景に白文字の場面として結合される", async ({ page }, testInfo) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("blue.mp4")]);

  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();
  await enterText(page, "■", "1.0");
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(1)).toContainText("📝 ■(1.0秒)");
  const saved = testInfo.outputPath("merged.mp4");
  await mergeAndDownload(page, saved);

  const [first, middle, last] = colorsAt(saved, [0.5, 1.5, 2.5]);
  expect([isCloseColor(first, RED), isCloseColor(middle, WHITE), isCloseColor(last, BLUE)]).toEqual([true, true, true]);
  const corners = [[0, 0], [318, 0], [0, 178], [318, 178]].map(([x, y]) => samplePixel(saved, 1.5, x, y));
  expect(corners.map((c) => isCloseColor(c, BLACK))).toEqual([true, true, true, true]);
  expect(Math.abs(probeVideo(saved).durationSeconds - 3)).toBeLessThanOrEqual(TOLERANCE);
  expect(decodesToEnd(saved)).toEqual({ ok: true, stderr: "" });
});

test("動画1本の前後に見出しを置いて結合できる", async ({ page }, testInfo) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4")]);

  await mergeSection(page).getByRole("button", { name: "先頭にテキストを挿入" }).click();
  await enterText(page, "■", "1.0");
  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();
  await enterText(page, "■", "1.0");
  const saved = testInfo.outputPath("merged.mp4");
  await mergeAndDownload(page, saved);

  const [first, middle, last] = colorsAt(saved, [0.5, 1.5, 2.5]);
  expect([isCloseColor(first, WHITE), isCloseColor(middle, RED), isCloseColor(last, WHITE)]).toEqual([true, true, true]);
});

test("見出しの文言と表示時間を編集し、並べ替えると、その位置・文言・長さで結合される", async ({ page }, testInfo) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("blue.mp4")]);
  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();
  await enterText(page, "■", "1.0");

  await mergeSection(page).getByRole("button", { name: "テキストの場面: ■ を編集" }).click();
  await enterText(page, "■\n■\n■", "2.0");
  await mergeSection(page).getByRole("button", { name: "テキストの場面: ■ を先頭へ" }).click();
  await expect(rows(page).nth(0)).toContainText("📝 ■…(2.0秒)");
  const saved = testInfo.outputPath("merged.mp4");
  await mergeAndDownload(page, saved);

  const [scene, red, blue] = colorsAt(saved, [1.0, 2.5, 3.5]);
  expect([isCloseColor(scene, WHITE), isCloseColor(red, RED), isCloseColor(blue, BLUE)]).toEqual([true, true, true]);
  expect(Math.abs(probeVideo(saved).durationSeconds - 4)).toBeLessThanOrEqual(TOLERANCE);
  // 3行になったので、1行のときより白い部分が縦に長い(文字の大きさ 8px、行の間隔 12px)
  const box = brightBoundingBox(saved, 1.0);
  expect(box).not.toBeNull();
  expect(box!.bottom - box!.top).toBeGreaterThanOrEqual(24);
  expect(box!.left).toBeGreaterThanOrEqual(16);
  expect(box!.right).toBeLessThanOrEqual(304);
});

test("見出しを削除すると、動画だけが結合される", async ({ page }, testInfo) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("blue.mp4")]);
  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();
  await enterText(page, "■", "1.0");

  await mergeSection(page).getByRole("button", { name: "テキストの場面: ■ を削除" }).click();
  await expect(rows(page)).toHaveCount(2);
  const saved = testInfo.outputPath("merged.mp4");
  await mergeAndDownload(page, saved);

  expect(Math.abs(probeVideo(saved).durationSeconds - 2)).toBeLessThanOrEqual(TOLERANCE);
});

test("21文字の行や絵文字は、確定した時点で理由が表示され、一覧に入らない", async ({ page }) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4")]);
  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();

  await enterText(page, "あ".repeat(21), "3.0");
  await expect(mergeSection(page).getByRole("alert")).toHaveText("1行は20文字までです(1行目が21文字)");
  await enterText(page, "京都😀", "3.0");
  await expect(mergeSection(page).getByRole("alert")).toHaveText("表示できない文字が含まれています: 😀");

  await expect(rows(page)).toHaveCount(1);
  await expect(mergeSection(page).getByRole("button", { name: "結合する" })).toBeDisabled();
  await expect(mergeSection(page).getByRole("status")).toHaveText("テキストの入力を確定するか取り消してください");
});

test("フォントにない文字は、結合を頼んだときにサーバーの理由が表示され、結合が始まらない", async ({ page }) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4")]);
  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();
  await enterText(page, "한", "1.0");
  await expect(rows(page)).toHaveCount(2);

  await mergeSection(page).getByRole("button", { name: "結合する" }).click();

  await expect(mergeSection(page).getByRole("status")).toHaveText(
    "2番目のテキストの場面: 表示できない文字が含まれています: 한",
  );
  await expect(page.getByRole("link", { name: "ダウンロード" })).toHaveCount(0);
});

test("入力欄を開いている間は、並べ替え・削除と結合ができない", async ({ page }) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("blue.mp4")]);

  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();

  for (const name of ["red.mp4 を下へ", "blue.mp4 を上へ", "red.mp4 を削除", "blue.mp4 を削除", "結合する"]) {
    await expect(mergeSection(page).getByRole("button", { name })).toBeDisabled();
  }
});

test("見出しの表示時間を足して30分を超えると、超えた時間が表示され結合ボタンを押せない", async ({ page }) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("long-a.mp4"), videoPath("long-899.mp4")]);
  await expect(mergeSection(page).getByText("合計 30:00 / 30:00", { exact: true })).toBeVisible();
  await expect(mergeSection(page).getByRole("button", { name: "結合する" })).toBeEnabled();

  await mergeSection(page).getByRole("button", { name: "先頭にテキストを挿入" }).click();
  await enterText(page, "京都", "1.0");

  await expect(mergeSection(page).getByText("合計 30:01 / 30:00", { exact: true })).toBeVisible();
  await expect(mergeSection(page).getByRole("status")).toHaveText("結合後の長さが30分を1秒超えています");
  await expect(mergeSection(page).getByRole("button", { name: "結合する" })).toBeDisabled();
});
