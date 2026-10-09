import type { MergeItem } from "./types";

/** 結合リストの動画の本数を返す(テキストの場面は数えない)。 */
export function countVideoItems(items: MergeItem[]): number {
  return items.filter((item) => item.kind === "video").length;
}
