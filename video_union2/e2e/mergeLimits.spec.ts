import { expect, test } from "@playwright/test";
import { videoPath } from "./support/videos";

test("結合後の長さが30分を超えると、超えた時間が表示され結合ボタンを押せない", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("動画ファイルを選択").setInputFiles([videoPath("long-a.mp4"), videoPath("long-b.mp4")]);

  const mergeSection = page.getByRole("region", { name: "結合" });
  await expect(mergeSection.getByRole("list", { name: "結合リスト" }).getByRole("listitem")).toHaveCount(2);
  await expect(mergeSection.getByText("合計 30:02 / 30:00", { exact: true })).toBeVisible();
  await expect(mergeSection.getByRole("status")).toHaveText("結合後の長さが30分を2秒超えています");
  await expect(mergeSection.getByRole("button", { name: "結合する" })).toBeDisabled();
});
