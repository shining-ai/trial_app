import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";
import { itemName } from "./itemName";
import { moveItemById } from "./moveItemById";
import type { MergeItem } from "./types";

/** ドラッグ操作の読み上げ(日本語)を返す。id が一覧にないときは undefined(読み上げない)。 */
export function dragAnnouncements(items: MergeItem[]): {
  screenReaderInstructions: ScreenReaderInstructions;
  announcements: Announcements;
} {
  const find = (id: string | number) => {
    const index = items.findIndex((item) => item.id === id);
    return index === -1 ? null : { name: itemName(items[index]), index };
  };

  const announcements: Announcements = {
    onDragStart({ active }) {
      const found = find(active.id);
      if (!found) return undefined;
      return `${found.name} をつかみました。今は ${found.index + 1} 番目です。`;
    },
    onDragOver({ active, over }) {
      const found = find(active.id);
      if (!found) return undefined;
      if (!over) return `${found.name} は一覧の外にあります。`;
      // つかんだ直後に自分自身の上にいる通知が来るので、元の位置では読み上げない(「つかみました」を上書きしないため)
      if (over.id === active.id) return undefined;
      const target = find(over.id);
      if (!target) return undefined;
      return `${found.name} を ${target.index + 1} 番目に動かしました。`;
    },
    onDragEnd({ active, over }) {
      const found = find(active.id);
      if (!found) return undefined;
      if (!over) return `${found.name} を元の位置に戻しました。`;
      if (!find(over.id)) return undefined;
      const position =
        moveItemById(items, String(active.id), String(over.id)).findIndex((item) => item.id === active.id) + 1;
      return `${found.name} を ${position} 番目に置きました。`;
    },
    onDragCancel({ active }) {
      const found = find(active.id);
      if (!found) return undefined;
      return `並べ替えを取り消しました。${found.name} は ${found.index + 1} 番目のままです。`;
    },
  };

  return {
    screenReaderInstructions: {
      draggable:
        "並べ替えるには、スペースキーでつかみ、上下の矢印キーで動かし、もう一度スペースキーで置きます。Esc キーで取り消します。",
    },
    announcements,
  };
}
