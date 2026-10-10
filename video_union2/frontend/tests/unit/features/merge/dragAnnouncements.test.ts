import { describe, expect, test } from "vitest";
import { dragAnnouncements } from "../../../../src/features/merge/dragAnnouncements";
import { moveItemById } from "../../../../src/features/merge/moveItemById";
import type { MergeItem } from "../../../../src/features/merge/types";

const items: MergeItem[] = [
  { kind: "video", id: "red", file_name: "red.mp4", duration_seconds: 1, width: 640, height: 360 },
  { kind: "text", id: "text-1", text: "京都", durationTenths: 30 },
  { kind: "video", id: "blue", file_name: "blue.mp4", duration_seconds: 1, width: 640, height: 360 },
];

// dnd-kit の Active / Over のうち、読み上げが使う id だけの最小の形
function args(activeId: string, overId: string | null) {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as never;
}

describe("dragAnnouncements", () => {
  const { screenReaderInstructions, announcements } = dragAnnouncements(items);

  test("操作の説明は固定の日本語の文", () => {
    expect(screenReaderInstructions.draggable).toBe(
      "並べ替えるには、スペースキーでつかみ、上下の矢印キーで動かし、もう一度スペースキーで置きます。Esc キーで取り消します。",
    );
  });

  test("blue をつかむと「今は 3 番目です。」", () => {
    expect(announcements.onDragStart(args("blue", null))).toBe("blue.mp4 をつかみました。今は 3 番目です。");
  });

  test("テキストの場面をつかむと名前と「今は 2 番目です。」", () => {
    expect(announcements.onDragStart(args("text-1", null))).toBe(
      "テキストの場面: 京都 をつかみました。今は 2 番目です。",
    );
  });

  test("blue を red の上へ動かすと「1 番目に動かしました。」", () => {
    expect(announcements.onDragOver(args("blue", "red"))).toBe("blue.mp4 を 1 番目に動かしました。");
  });

  test("元の位置(自分自身)の上に戻ると、元の番号に「動かしました」と読み上げる", () => {
    expect(announcements.onDragOver(args("blue", "blue"))).toBe("blue.mp4 を 3 番目に動かしました。");
  });

  test("blue を一覧の外へ動かすと「一覧の外にあります。」", () => {
    expect(announcements.onDragOver(args("blue", null))).toBe("blue.mp4 は一覧の外にあります。");
  });

  test("blue を red の上で置くと「1 番目に置きました。」", () => {
    expect(announcements.onDragEnd(args("blue", "red"))).toBe("blue.mp4 を 1 番目に置きました。");
  });

  test("red を blue の上で置くと「3 番目に置きました。」", () => {
    expect(announcements.onDragEnd(args("red", "blue"))).toBe("red.mp4 を 3 番目に置きました。");
  });

  test("blue を blue の上で置くと「3 番目に置きました。」", () => {
    expect(announcements.onDragEnd(args("blue", "blue"))).toBe("blue.mp4 を 3 番目に置きました。");
  });

  test("blue を一覧の外で離すと「元の位置に戻しました。」", () => {
    expect(announcements.onDragEnd(args("blue", null))).toBe("blue.mp4 を元の位置に戻しました。");
  });

  test("取り消すと「並べ替えを取り消しました。blue.mp4 は 3 番目のままです。」", () => {
    expect(announcements.onDragCancel(args("blue", "red"))).toBe(
      "並べ替えを取り消しました。blue.mp4 は 3 番目のままです。",
    );
  });

  test("3件のすべての組み合わせで、「置いた」の番号が moveItemById の位置 +1 と一致する", () => {
    for (const active of items) {
      for (const over of items) {
        const position = moveItemById(items, active.id, over.id).findIndex((item) => item.id === active.id) + 1;

        const message = announcements.onDragEnd(args(active.id, over.id));

        expect(message).toMatch(new RegExp(` を ${position} 番目に置きました。$`));
      }
    }
  });

  test("一覧にない id では undefined を返す(つかむ・動かす・置く・取り消す)", () => {
    expect(announcements.onDragStart(args("missing", null))).toBeUndefined();
    expect(announcements.onDragOver(args("missing", "red"))).toBeUndefined();
    expect(announcements.onDragEnd(args("missing", "red"))).toBeUndefined();
    expect(announcements.onDragCancel(args("missing", null))).toBeUndefined();
  });

  test("over の id が一覧にないときは undefined を返す", () => {
    expect(announcements.onDragOver(args("blue", "missing"))).toBeUndefined();
    expect(announcements.onDragEnd(args("blue", "missing"))).toBeUndefined();
  });
});
