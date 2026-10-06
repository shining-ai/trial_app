import { expect, type Page } from "@playwright/test";
import { basename } from "node:path";

/**
 * 動画を1本ずつアップロードし、結合リストに入るのを待つ。
 * 同時に選ぶと完了した順にリストへ入るため、並び順を決めたいテストではこの関数を使う。
 */
export async function uploadInOrder(page: Page, paths: string[]) {
  const list = page.getByRole("list", { name: "結合リスト" });
  for (const [index, path] of paths.entries()) {
    await page.getByLabel("動画ファイルを選択").setInputFiles(path);
    await expect(list.getByRole("listitem")).toHaveCount(index + 1);
    await expect(list.getByRole("listitem").nth(index)).toContainText(basename(path));
  }
}
