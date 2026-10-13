import type { MergeItem } from "./types";

/** 外したときの位置。前後の項目の id と、そのときの番号。 */
export type RemovedPosition = { previousId: string | null; nextId: string | null; index: number };

/**
 * 外した項目を、外したときの位置に戻した新しい配列を返す。
 * 外したあとに挿入・並べ替えがあっても隣の項目との関係が保たれるよう、番号ではなく前後の項目の id で決める。
 * 元の直後の項目の前 → 元の直前の項目の後 → 元の番号(一覧の長さまで)の順に探す。
 */
export function restoreRemovedItem(items: MergeItem[], item: MergeItem, position: RemovedPosition): MergeItem[] {
  const nextIndex = position.nextId === null ? -1 : items.findIndex((existing) => existing.id === position.nextId);
  if (nextIndex >= 0) return [...items.slice(0, nextIndex), item, ...items.slice(nextIndex)];
  const previousIndex =
    position.previousId === null ? -1 : items.findIndex((existing) => existing.id === position.previousId);
  const at = previousIndex >= 0 ? previousIndex + 1 : Math.min(position.index, items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}
