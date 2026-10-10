import type { MergeItem } from "./types";

/** activeId の項目を overId の項目の位置へ動かした新しい配列を返す(dnd-kit の arrayMove と同じ並び)。 */
export function moveItemById(items: MergeItem[], activeId: string, overId: string): MergeItem[] {
  const result = [...items];
  const from = items.findIndex((item) => item.id === activeId);
  const to = items.findIndex((item) => item.id === overId);
  if (from === -1 || to === -1) return result;
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}
