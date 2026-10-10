import { expect, test, type Locator, type Page } from "@playwright/test";
import { decodesToEnd, isCloseColor, probeVideo, samplePixel } from "./support/inspectVideo";
import { uploadInOrder } from "./support/uploadInOrder";
import { videoPath } from "./support/videos";

const RED: [number, number, number] = [255, 0, 0];
const GREEN: [number, number, number] = [0, 128, 0];
const BLUE: [number, number, number] = [0, 0, 255];
const WHITE: [number, number, number] = [255, 255, 255];
const TOLERANCE = 1 / 30 + 0.03;

test.setTimeout(120_000);
// 画面の端に近いと dnd-kit の自動スクロールが動くので、一覧が画面の中ほどに収まるよう縦に広げる
test.use({ viewport: { width: 1280, height: 1100 } });

function mergeSection(page: Page) {
  return page.getByRole("region", { name: "結合" });
}

function rows(page: Page) {
  return mergeSection(page).getByRole("list", { name: "結合リスト" }).getByRole("listitem");
}

function handle(page: Page, name: string) {
  return mergeSection(page).getByRole("button", { name: `${name} をドラッグして並べ替え` });
}

/** dnd-kit の読み上げの領域(aria-live 付きの status。結合ボタンの横の status とは別) */
function announcement(page: Page) {
  return page.locator('[role="status"][aria-live]');
}

async function expectOrder(page: Page, names: string[]) {
  await expect(rows(page)).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(rows(page).nth(index)).toContainText(name);
  }
}

async function centerOf(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("要素の位置が取れません");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * つまみ(または任意の要素)の中央で押し、目標の位置まで動かして離す。
 * 開始の条件(4ピクセル)を超えるよう先に少し動かし、目標までは細かく動かす。離す前の確認を beforeUp で行える。
 */
async function drag(page: Page, from: Locator, to: { x: number; y: number }, beforeUp?: () => Promise<void>) {
  const start = await centerOf(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 10, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.move(to.x, to.y + 2, { steps: 2 });
  if (beforeUp) await beforeUp();
  await page.mouse.up();
}

/**
 * キーを押し、読み上げが期待の文になるまで待つ。dnd-kit はスペースでつかんでから少し遅れて矢印キーを受け付け始めるため、
 * テストのように間を空けずに押すと最初のキーが捨てられることがある。読み上げが変わっていない(動いていない)ときだけ押し直す。
 */
async function pressUntilAnnounced(page: Page, key: string, expected: string) {
  await expect(async () => {
    await page.keyboard.press(key);
    await expect(announcement(page)).toHaveText(expected, { timeout: 500 });
  }).toPass({ timeout: 5_000 });
}

async function mergeAndDownload(page: Page, savePath: string) {
  const link = page.getByRole("link", { name: "ダウンロード" });
  // dnd-kit は、ドラッグを離してから50ミリ秒の間のクリックを捨てる(離した場所での誤クリックを防ぐため)。
  // テストは人より速く押すので、結合が始まった(結合中の表示かダウンロードのリンクが出た)ことを確かめ、始まらなければ押し直す
  // 結合がもう始まっている(結合中の表示かリンクが出ている)ときは押さない(結合を2回走らせないため)
  const started = mergeSection(page).getByText("結合中です").or(link);
  await expect(async () => {
    if (!(await started.isVisible())) await mergeSection(page).getByRole("button", { name: "結合する" }).click();
    await expect(started).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(link).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  await (await downloadPromise).saveAs(savePath);
}

async function uploadThree(page: Page) {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("green.mp4"), videoPath("blue.mp4")]);
  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);
}

test("末尾の動画のつまみを先頭の行までドラッグすると、その順で結合される(ドラッグ中は入る位置を読み上げる)", async ({
  page,
}, testInfo) => {
  await uploadThree(page);

  await drag(page, handle(page, "blue.mp4"), await centerOf(handle(page, "red.mp4")), async () => {
    await expect(handle(page, "blue.mp4")).toHaveAttribute("aria-pressed", "true");
    await expect(announcement(page)).toHaveText("blue.mp4 を 1 番目に動かしました。");
  });

  await expectOrder(page, ["blue.mp4", "red.mp4", "green.mp4"]);
  await expect(announcement(page)).toHaveText("blue.mp4 を 1 番目に置きました。");
  const saved = testInfo.outputPath("merged.mp4");
  await mergeAndDownload(page, saved);
  const colors = [0.5, 1.5, 2.5].map((t) => samplePixel(saved, t, 160, 90));
  expect(colors.map((c, i) => isCloseColor(c, [BLUE, RED, GREEN][i]))).toEqual([true, true, true]);
});

test("テキストの場面のつまみを動画の下までドラッグすると、その位置に見出しが入って結合される", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("blue.mp4")]);
  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();
  await mergeSection(page).getByLabel("テキスト", { exact: true }).fill("■");
  await mergeSection(page).getByLabel("表示時間(秒)").fill("1.0");
  await mergeSection(page).getByRole("button", { name: "確定" }).click();
  await expectOrder(page, ["red.mp4", "📝 ■(1.0秒)", "blue.mp4"]);

  await drag(page, handle(page, "テキストの場面: ■"), await centerOf(handle(page, "blue.mp4")));

  await expectOrder(page, ["red.mp4", "blue.mp4", "📝 ■(1.0秒)"]);
  const saved = testInfo.outputPath("merged.mp4");
  await mergeAndDownload(page, saved);
  const colors = [0.5, 1.5, 2.5].map((t) => samplePixel(saved, t, 159, 89));
  expect(colors.map((c, i) => isCloseColor(c, [RED, BLUE, WHITE][i]))).toEqual([true, true, true]);
  expect(Math.abs(probeVideo(saved).durationSeconds - 3)).toBeLessThanOrEqual(TOLERANCE);
  expect(decodesToEnd(saved)).toEqual({ ok: true, stderr: "" });
});

test("先頭の動画を一覧の外(結合ボタンのあたり)まで動かして離すと、並びは変わらない", async ({ page }) => {
  await uploadThree(page);

  await drag(page, handle(page, "red.mp4"), await centerOf(mergeSection(page).getByRole("button", { name: "結合する" })));

  await expect(announcement(page)).toHaveText("red.mp4 を元の位置に戻しました。");
  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);
});

test("ドラッグ中に Esc キーを押すと取り消され、並びは変わらない", async ({ page }) => {
  await uploadThree(page);

  await drag(page, handle(page, "blue.mp4"), await centerOf(handle(page, "red.mp4")), async () => {
    await expect(announcement(page)).toHaveText("blue.mp4 を 1 番目に動かしました。");
    await page.keyboard.press("Escape");
    await expect(announcement(page)).toHaveText("並べ替えを取り消しました。blue.mp4 は 3 番目のままです。");
  });

  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);
});

test("キーボードだけで、スペースでつかみ、上矢印で動かし、スペースで置ける(読み上げは日本語)", async ({ page }) => {
  await uploadThree(page);
  const blue = handle(page, "blue.mp4");

  await blue.focus();
  await page.keyboard.press("Space");
  await expect(announcement(page)).toHaveText("blue.mp4 をつかみました。今は 3 番目です。");
  await pressUntilAnnounced(page, "ArrowUp", "blue.mp4 を 2 番目に動かしました。");
  await pressUntilAnnounced(page, "ArrowUp", "blue.mp4 を 1 番目に動かしました。");
  await pressUntilAnnounced(page, "Space", "blue.mp4 を 1 番目に置きました。");

  await expectOrder(page, ["blue.mp4", "red.mp4", "green.mp4"]);
  await expect(blue).toBeFocused();
});

test("キーボードでつかんで動かし、元の位置に戻すとその位置を読み上げ、Esc キーで取り消すと並びは変わらない", async ({
  page,
}) => {
  await uploadThree(page);

  await handle(page, "blue.mp4").focus();
  await page.keyboard.press("Space");
  await expect(announcement(page)).toHaveText("blue.mp4 をつかみました。今は 3 番目です。");
  await pressUntilAnnounced(page, "ArrowUp", "blue.mp4 を 2 番目に動かしました。");
  await pressUntilAnnounced(page, "ArrowDown", "blue.mp4 を 3 番目に動かしました。");
  await pressUntilAnnounced(page, "ArrowUp", "blue.mp4 を 2 番目に動かしました。");
  await page.keyboard.press("Escape");

  await expect(announcement(page)).toHaveText("並べ替えを取り消しました。blue.mp4 は 3 番目のままです。");
  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);
});

test("入力欄を開いている間はつまみが押せずドラッグしても並ばない。取り消すと同じ操作で並ぶ", async ({ page }) => {
  await uploadThree(page);
  await mergeSection(page).getByRole("button", { name: "先頭にテキストを挿入" }).click();

  await expect(handle(page, "blue.mp4")).toBeDisabled();
  await drag(page, handle(page, "blue.mp4"), await centerOf(handle(page, "red.mp4")));
  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);

  await mergeSection(page).getByRole("button", { name: "取り消し" }).click();
  await drag(page, handle(page, "blue.mp4"), await centerOf(handle(page, "red.mp4")));
  await expectOrder(page, ["blue.mp4", "red.mp4", "green.mp4"]);
});

test("行のファイル名の文字からはドラッグできない。そのあとボタンの並べ替えはふつうに使える", async ({ page }) => {
  await uploadThree(page);
  const blueName = rows(page).nth(2).getByText("blue.mp4", { exact: true });

  await drag(page, blueName, await centerOf(handle(page, "red.mp4")));
  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);

  await mergeSection(page).getByRole("button", { name: "blue.mp4 を上へ" }).click();
  await expectOrder(page, ["red.mp4", "blue.mp4", "green.mp4"]);
});
