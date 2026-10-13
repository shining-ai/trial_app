import type { Announcements } from "@dnd-kit/core";
import { expect, test } from "vitest";
import { suppressFirstSelfOver } from "../../../../src/features/merge/suppressFirstSelfOver";

const base: Announcements = {
  onDragStart: ({ active }) => `${active.id} をつかみました`,
  onDragOver: ({ active, over }) => (over ? `${active.id} を ${over.id} に動かしました` : `${active.id} は外です`),
  onDragEnd: ({ active }) => `${active.id} を置きました`,
  onDragCancel: ({ active }) => `${active.id} を取り消しました`,
};

function args(active: string, over: string | null) {
  return { active: { id: active }, over: over === null ? null : { id: over } } as never;
}

test("つかんだ直後の、自分自身の上にいる通知だけは読み上げない(「つかみました」を上書きしないため)", () => {
  const announcements = suppressFirstSelfOver(base);

  expect(announcements.onDragStart(args("c", null))).toBe("c をつかみました");
  expect(announcements.onDragOver(args("c", "c"))).toBeUndefined();
});

test("一度ほかの行や一覧の外へ動いたあとに元の位置へ戻ると、元の位置を読み上げる", () => {
  const announcements = suppressFirstSelfOver(base);
  announcements.onDragStart(args("c", null));
  announcements.onDragOver(args("c", "c"));

  expect(announcements.onDragOver(args("c", "b"))).toBe("c を b に動かしました");
  expect(announcements.onDragOver(args("c", "c"))).toBe("c を c に動かしました");
  expect(announcements.onDragOver(args("c", null))).toBe("c は外です");
  expect(announcements.onDragOver(args("c", "c"))).toBe("c を c に動かしました");
});

test("新しくつかむと、また最初の自分自身の上の通知だけを抑える", () => {
  const announcements = suppressFirstSelfOver(base);
  announcements.onDragStart(args("c", null));
  announcements.onDragOver(args("c", "b"));
  announcements.onDragEnd(args("c", "b"));

  announcements.onDragStart(args("a", null));

  expect(announcements.onDragOver(args("a", "a"))).toBeUndefined();
});

test("置いた・取り消したの読み上げはそのまま", () => {
  const announcements = suppressFirstSelfOver(base);

  expect(announcements.onDragEnd(args("c", "a"))).toBe("c を置きました");
  expect(announcements.onDragCancel(args("c", null))).toBe("c を取り消しました");
});
