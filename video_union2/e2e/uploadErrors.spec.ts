import { expect, test } from "@playwright/test";
import { videoPath } from "./support/videos";

test("動画でないファイルはその項目だけ失敗し、一緒に選んだ動画は結合リストに入る", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("動画ファイルを選択").setInputFiles([videoPath("not_a_video.mp4"), videoPath("red.mp4")]);

  const uploads = page.getByRole("list", { name: "アップロードの状況" });
  const failed = uploads.getByRole("listitem").filter({ hasText: "not_a_video.mp4" });
  await expect(failed.getByRole("alert")).toHaveText("動画として読み込めませんでした");
  const mergeList = page.getByRole("list", { name: "結合リスト" });
  await expect(mergeList.getByRole("listitem")).toHaveCount(1);
  await expect(mergeList.getByRole("listitem")).toContainText("red.mp4");
});

test("結合リストの項目を削除すると一覧から消える", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("動画ファイルを選択").setInputFiles(videoPath("red.mp4"));
  const mergeList = page.getByRole("list", { name: "結合リスト" });
  await expect(mergeList.getByRole("listitem")).toHaveCount(1);

  await page.getByRole("button", { name: "red.mp4 を削除" }).click();

  await expect(mergeList.getByRole("listitem")).toHaveCount(0);
});
