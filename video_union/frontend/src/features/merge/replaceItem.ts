import type { MergeItem } from "./types";

/** 指定の id の項目を置き換えた新しい配列を返す。見つからなければ同じ並びを返す。 */
export function replaceItem(items: MergeItem[], id: string, item: MergeItem): MergeItem[] {
  return items.map((existing) => (existing.id === id ? item : existing));
}
