import { describe, expect, test } from "vitest";
import { moveItemById } from "../../../../src/features/merge/moveItemById";
import type { MergeItem } from "../../../../src/features/merge/types";

function video(id: string): MergeItem {
  return { kind: "video", id, file_name: `${id}.mp4`, duration_seconds: 1, width: 640, height: 360 };
}

function text(id: string): MergeItem {
  return { kind: "text", id, text: "京都", durationTenths: 30 };
}

function ids(items: MergeItem[]): string[] {
  return items.map((item) => item.id);
}

describe("moveItemById", () => {
  const abc = () => [video("A"), video("B"), video("C")];

  test("C を A の位置へ動かすと [C,A,B]", () => {
    expect(ids(moveItemById(abc(), "C", "A"))).toEqual(["C", "A", "B"]);
  });

  test("A を C の位置へ動かすと [B,C,A]", () => {
    expect(ids(moveItemById(abc(), "A", "C"))).toEqual(["B", "C", "A"]);
  });

  test("B を C の位置へ動かすと [A,C,B]", () => {
    expect(ids(moveItemById(abc(), "B", "C"))).toEqual(["A", "C", "B"]);
  });

  test("B を A の位置へ動かすと [B,A,C]", () => {
    expect(ids(moveItemById(abc(), "B", "A"))).toEqual(["B", "A", "C"]);
  });

  test("テキストの場面 T も B の位置へ動かせて [A,B,T]", () => {
    const items = [video("A"), text("T"), video("B")];

    expect(ids(moveItemById(items, "T", "B"))).toEqual(["A", "B", "T"]);
  });

  test("同じ id では同じ並びの、元とは別の配列を返す", () => {
    const original = abc();

    const moved = moveItemById(original, "B", "B");

    expect(ids(moved)).toEqual(["A", "B", "C"]);
    expect(moved).not.toBe(original);
  });

  test("存在しない activeId では同じ並びを返す", () => {
    expect(ids(moveItemById(abc(), "X", "A"))).toEqual(["A", "B", "C"]);
  });

  test("存在しない overId では同じ並びを返す", () => {
    expect(ids(moveItemById(abc(), "A", "X"))).toEqual(["A", "B", "C"]);
  });

  test("1件の一覧で A を A へ動かしても [A]", () => {
    expect(ids(moveItemById([video("A")], "A", "A"))).toEqual(["A"]);
  });

  test("空の一覧は空のまま", () => {
    expect(moveItemById([], "A", "B")).toEqual([]);
  });

  test("元の配列を変更しない", () => {
    const original = abc();

    moveItemById(original, "C", "A");

    expect(ids(original)).toEqual(["A", "B", "C"]);
  });
});
