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

/** 行の名前(動画はファイル名、テキストの場面は「テキストの場面: {1行目}」)を、行に表示している文字にする */
function shownText(name: string) {
  const prefix = "テキストの場面: ";
  return name.startsWith(prefix) ? `📝 ${name.slice(prefix.length)}` : name;
}

/** 名前の行(パネル)。キーボードでフォーカスしてつかむ対象 */
function row(page: Page, name: string) {
  return rows(page).filter({ hasText: shownText(name) });
}

/**
 * 行の中の名前の表示。マウスでつかむ位置と、離す目標に使う。
 * テキストの場面の表示は読み上げ用に role="img" と名前を持つので、役割と名前で探す
 */
function grip(page: Page, name: string) {
  return name.startsWith("テキストの場面: ")
    ? row(page, name).getByRole("img", { name })
    : row(page, name).getByText(name, { exact: true });
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
 * 指定の要素の中央で押し、目標の位置まで動かして離す。
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

test("末尾の動画の行を先頭の行までドラッグすると、その順で結合される(ドラッグ中は入る位置を読み上げる)", async ({
  page,
}, testInfo) => {
  await uploadThree(page);

  await drag(page, grip(page, "blue.mp4"), await centerOf(grip(page, "red.mp4")), async () => {
    await expect(announcement(page)).toHaveText("blue.mp4 を 1 番目に動かしました。");
  });

  await expectOrder(page, ["blue.mp4", "red.mp4", "green.mp4"]);
  await expect(announcement(page)).toHaveText("blue.mp4 を 1 番目に置きました。");
  const saved = testInfo.outputPath("merged.mp4");
  await mergeAndDownload(page, saved);
  const colors = [0.5, 1.5, 2.5].map((t) => samplePixel(saved, t, 160, 90));
  expect(colors.map((c, i) => isCloseColor(c, [BLUE, RED, GREEN][i]))).toEqual([true, true, true]);
});

test("テキストの場面の行を動画の下までドラッグすると、その位置に見出しが入って結合される", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("blue.mp4")]);
  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();
  await mergeSection(page).getByLabel("テキスト", { exact: true }).fill("■");
  await mergeSection(page).getByLabel("表示時間(秒)").fill("1.0");
  await mergeSection(page).getByRole("button", { name: "確定" }).click();
  await expectOrder(page, ["red.mp4", "📝 ■(1.0秒)", "blue.mp4"]);

  await drag(page, grip(page, "テキストの場面: ■"), await centerOf(grip(page, "blue.mp4")));

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

  await drag(page, grip(page, "red.mp4"), await centerOf(mergeSection(page).getByRole("button", { name: "結合する" })));

  await expect(announcement(page)).toHaveText("red.mp4 を元の位置に戻しました。");
  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);
});

test("ドラッグ中に Esc キーを押すと取り消され、並びは変わらない", async ({ page }) => {
  await uploadThree(page);

  await drag(page, grip(page, "blue.mp4"), await centerOf(grip(page, "red.mp4")), async () => {
    await expect(announcement(page)).toHaveText("blue.mp4 を 1 番目に動かしました。");
    await page.keyboard.press("Escape");
    await expect(announcement(page)).toHaveText("並べ替えを取り消しました。blue.mp4 は 3 番目のままです。");
  });

  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);
});

test("キーボードだけで、スペースでつかみ、上矢印で動かし、スペースで置ける(読み上げは日本語)", async ({ page }) => {
  await uploadThree(page);
  const blue = row(page, "blue.mp4");

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

  await row(page, "blue.mp4").focus();
  await page.keyboard.press("Space");
  await expect(announcement(page)).toHaveText("blue.mp4 をつかみました。今は 3 番目です。");
  await pressUntilAnnounced(page, "ArrowUp", "blue.mp4 を 2 番目に動かしました。");
  await pressUntilAnnounced(page, "ArrowDown", "blue.mp4 を 3 番目に動かしました。");
  await pressUntilAnnounced(page, "ArrowUp", "blue.mp4 を 2 番目に動かしました。");
  await page.keyboard.press("Escape");

  await expect(announcement(page)).toHaveText("並べ替えを取り消しました。blue.mp4 は 3 番目のままです。");
  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);
});

test("入力欄を開いている間は行をつかめずドラッグしても並ばない。取り消すと同じ操作で並ぶ", async ({ page }) => {
  await uploadThree(page);
  await mergeSection(page).getByRole("button", { name: "先頭にテキストを挿入" }).click();

  await expect(row(page, "blue.mp4")).not.toHaveAttribute("tabindex");
  await drag(page, grip(page, "blue.mp4"), await centerOf(grip(page, "red.mp4")));
  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);

  await mergeSection(page).getByRole("button", { name: "取り消し" }).click();
  await drag(page, grip(page, "blue.mp4"), await centerOf(grip(page, "red.mp4")));
  await expectOrder(page, ["blue.mp4", "red.mp4", "green.mp4"]);
});

test("行のファイル名の文字をつかんでドラッグしても並べ替えられる", async ({ page }) => {
  await uploadThree(page);
  const blueName = rows(page).nth(2).getByText("blue.mp4", { exact: true });

  await drag(page, blueName, await centerOf(rows(page).nth(0).getByText("red.mp4", { exact: true })));

  await expectOrder(page, ["blue.mp4", "red.mp4", "green.mp4"]);
  await expect(announcement(page)).toHaveText("blue.mp4 を 1 番目に置きました。");
});

test("テキストの場面の行の余白(説明の文字の右側)をつかんでドラッグしても並べ替えられる", async ({ page }) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("blue.mp4")]);
  await mergeSection(page).getByRole("button", { name: "red.mp4 の後にテキストを挿入" }).click();
  await mergeSection(page).getByLabel("テキスト", { exact: true }).fill("■");
  await mergeSection(page).getByRole("button", { name: "確定" }).click();
  await expectOrder(page, ["red.mp4", "📝 ■(1.0秒)", "blue.mp4"]);
  // 説明の文字「テキストの場面」と同じ高さで、行の右端から60ピクセル内側の余白
  // (その位置がこの行の中で、ボタンでも文字でもないことを確かめてから押す)
  const row = rows(page).nth(1);
  const meta = row.getByText("テキストの場面", { exact: true });
  await meta.scrollIntoViewIfNeeded();
  const rowBox = (await row.boundingBox())!;
  const metaBox = (await meta.boundingBox())!;
  const start = { x: rowBox.x + rowBox.width - 60, y: metaBox.y + metaBox.height / 2 };
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    const range = document.caretRangeFromPoint(x, y);
    const overText = !!range && range.startContainer.nodeType === Node.TEXT_NODE &&
      (() => { const r = document.createRange(); r.selectNodeContents(range.startContainer); const b = r.getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; })();
    return { inRow: element?.closest("li")?.textContent?.includes("テキストの場面") ?? false, button: !!element?.closest("button"), overText };
  }, start);
  expect(hit).toEqual({ inRow: true, button: false, overText: false });
  const target = await centerOf(grip(page, "blue.mp4"));

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 10, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await page.mouse.move(target.x, target.y + 2, { steps: 2 });
  await page.mouse.up();

  await expectOrder(page, ["red.mp4", "blue.mp4", "📝 ■(1.0秒)"]);
});

test("行の中のボタンは、動かさずに押せばドラッグにならずボタンとして働く", async ({ page }) => {
  await uploadThree(page);

  await mergeSection(page).getByRole("button", { name: "blue.mp4 を上へ" }).click();

  await expectOrder(page, ["red.mp4", "blue.mp4", "green.mp4"]);
  await expect(announcement(page)).not.toHaveText(/置きました|つかみました/);
});

test("行の中のボタンでスペースキーを押しても、ドラッグは始まらずボタンとして働く(キーボードは行そのものからだけ)", async ({
  page,
}) => {
  await uploadThree(page);

  await mergeSection(page).getByRole("button", { name: "blue.mp4 を上へ" }).focus();
  await page.keyboard.press("Space");

  await expectOrder(page, ["red.mp4", "blue.mp4", "green.mp4"]);
  await expect(announcement(page)).not.toHaveText(/つかみました/);
});

test("行の中のボタンの上で押して大きく動かすとドラッグになり、ボタンは押されない(削除されない)", async ({ page }) => {
  await uploadThree(page);

  await drag(
    page,
    mergeSection(page).getByRole("button", { name: "blue.mp4 を削除" }),
    await centerOf(grip(page, "red.mp4")),
  );

  await expect(announcement(page)).toHaveText("blue.mp4 を 1 番目に置きました。");
  await expectOrder(page, ["blue.mp4", "red.mp4", "green.mp4"]);
});

test("行の中のボタンの上で押して少し(2ピクセル)ずれて離すと、ドラッグにならずボタンとして働く", async ({ page }) => {
  await uploadThree(page);
  const up = await centerOf(mergeSection(page).getByRole("button", { name: "blue.mp4 を上へ" }));

  await page.mouse.move(up.x, up.y);
  await page.mouse.down();
  await page.mouse.move(up.x + 2, up.y, { steps: 2 });
  await page.mouse.up();

  await expectOrder(page, ["red.mp4", "blue.mp4", "green.mp4"]);
});

test("入力欄を開いている間は、行の本体(ファイル名)からドラッグしても並ばない", async ({ page }) => {
  await uploadThree(page);
  await mergeSection(page).getByRole("button", { name: "先頭にテキストを挿入" }).click();

  await drag(
    page,
    rows(page).nth(2).getByText("blue.mp4", { exact: true }),
    await centerOf(rows(page).nth(0).getByText("red.mp4", { exact: true })),
  );

  await expectOrder(page, ["red.mp4", "green.mp4", "blue.mp4"]);
  await expect(announcement(page)).not.toHaveText(/つかみました|置きました/);
});
