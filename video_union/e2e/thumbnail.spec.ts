import { expect, test, type Locator } from "@playwright/test";
import { isCloseColor } from "./support/inspectVideo";
import { uploadInOrder } from "./support/uploadInOrder";
import { videoPath } from "./support/videos";

const RED: [number, number, number] = [255, 0, 0];
const GREEN: [number, number, number] = [0, 128, 0];
const BLUE: [number, number, number] = [0, 0, 255];

/** 読み込まれたサムネイルの中央の色を、画面上の画像から取り出す */
async function centerColor(thumbnail: Locator): Promise<[number, number, number]> {
  await expect(thumbnail).toHaveJSProperty("complete", true);
  return thumbnail.evaluate((image: HTMLImageElement) => {
    if (image.naturalWidth === 0) throw new Error("サムネイルが読み込まれていません");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("canvas を使えません");
    context.drawImage(image, 0, 0);
    const [r, g, b] = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    return [r, g, b] as [number, number, number];
  });
}

test("アップロードした動画の行に、その動画の色のサムネイルが出る", async ({ page }) => {
  await page.goto("/");
  await uploadInOrder(page, [videoPath("red.mp4"), videoPath("green.mp4"), videoPath("blue.mp4")]);

  const rows = page.getByRole("list", { name: "結合リスト" }).getByRole("listitem");
  const expected = [RED, GREEN, BLUE];
  for (const [index, color] of expected.entries()) {
    const thumbnail = rows.nth(index).getByTestId("video-thumbnail");
    await expect(thumbnail).toBeVisible();
    expect(isCloseColor(await centerColor(thumbnail), color)).toBe(true);
  }
  // 結合リストだけに出し、アップロードの状況の一覧には出さない
  await expect(page.getByRole("list", { name: "アップロードの状況" }).getByTestId("video-thumbnail")).toHaveCount(0);
});
