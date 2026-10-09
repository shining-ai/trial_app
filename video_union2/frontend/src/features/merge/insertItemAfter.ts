import type { MergeListItem } from "./types";

/** 指定の id の項目の後(null なら先頭)に項目を入れた新しい配列を返す。指定の id がなければ null。 */
export function insertItemAfter(
  items: MergeListItem[],
  afterId: string | null,
  item: MergeListItem,
): MergeListItem[] | null {
  if (afterId === null) return [item, ...items];
  const index = items.findIndex((existing) => existing.id === afterId);
  if (index < 0) return null;
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}
