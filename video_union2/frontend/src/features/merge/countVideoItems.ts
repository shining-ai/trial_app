import type { MergeListItem } from "./types";

/** 結合リストの動画の本数を返す(テキストの場面は数えない)。 */
export function countVideoItems(items: MergeListItem[]): number {
  return items.filter((item) => item.kind === "video").length;
}
