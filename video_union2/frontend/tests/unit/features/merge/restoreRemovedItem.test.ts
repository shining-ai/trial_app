import { expect, test } from "vitest";
import { restoreRemovedItem } from "../../../../src/features/merge/restoreRemovedItem";
import type { MergeItem, TextSceneItem, VideoItem } from "../../../../src/features/merge/types";

function video(id: string): VideoItem {
  return { kind: "video", id, file_name: `${id}.mp4`, duration_seconds: 1, width: 640, height: 360 };
}

function scene(id: string): TextSceneItem {
  return { kind: "text", id, text: "見出し", durationTenths: 30 };
}

const ids = (items: MergeItem[]) => items.map((item) => item.id);

test("元の直後の項目の前に戻すので、そのあと先頭に挿入した見出しより後ろに入る", () => {
  // [A, B, C] から A を外したあと、先頭に T を挿入して [T, B, C]
  const restored = restoreRemovedItem([scene("T"), video("B"), video("C")], video("A"), {
    previousId: null, nextId: "B", index: 0,
  });

  expect(ids(restored)).toEqual(["T", "A", "B", "C"]);
});

test("並べ替えられていても、元の直後の項目の前に戻す", () => {
  // [A, B, C] から A を外したあと、C を先頭へ動かして [C, B]
  const restored = restoreRemovedItem([video("C"), video("B")], video("A"), { previousId: null, nextId: "B", index: 0 });

  expect(ids(restored)).toEqual(["C", "A", "B"]);
});

test("元の直後の項目がなければ、元の直前の項目の後に戻す", () => {
  // [A, B, C] から C を外し、B も外したあと C だけが戻る
  const restored = restoreRemovedItem([video("A")], video("C"), { previousId: "B", nextId: null, index: 2 });

  expect(ids(restored)).toEqual(["A", "C"]);
});

test("末尾にあった項目は、直前の項目の後(末尾)に戻す", () => {
  const restored = restoreRemovedItem([video("A"), video("B"), scene("T")], video("C"), {
    previousId: "B", nextId: null, index: 2,
  });

  expect(ids(restored)).toEqual(["A", "B", "C", "T"]);
});

test("前後の項目がどちらもなければ、元の番号(一覧の長さまで)に戻す", () => {
  expect(ids(restoreRemovedItem([video("X"), video("Y")], video("A"), { previousId: "P", nextId: "N", index: 1 })))
    .toEqual(["X", "A", "Y"]);
  expect(ids(restoreRemovedItem([video("X")], video("A"), { previousId: "P", nextId: "N", index: 5 })))
    .toEqual(["X", "A"]);
});

test("元の配列は変更しない", () => {
  const items = [video("B")];

  restoreRemovedItem(items, video("A"), { previousId: null, nextId: "B", index: 0 });

  expect(ids(items)).toEqual(["B"]);
});
