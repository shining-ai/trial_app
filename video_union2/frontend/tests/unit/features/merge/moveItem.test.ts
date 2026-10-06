import { describe, expect, test } from "vitest";
import { moveItem } from "../../../../src/features/merge/moveItem";

describe("moveItem", () => {
  test("B を「上へ」で [B,A,C]", () => {
    expect(moveItem(["A", "B", "C"], 1, "up")).toEqual(["B", "A", "C"]);
  });

  test("B を「下へ」で [A,C,B]", () => {
    expect(moveItem(["A", "B", "C"], 1, "down")).toEqual(["A", "C", "B"]);
  });

  test("C を「先頭へ」で [C,A,B]", () => {
    expect(moveItem(["A", "B", "C"], 2, "top")).toEqual(["C", "A", "B"]);
  });

  test("A を「末尾へ」で [B,C,A]", () => {
    expect(moveItem(["A", "B", "C"], 0, "bottom")).toEqual(["B", "C", "A"]);
  });

  test("先頭の「上へ」は同じ並びを返し、元の配列は変更しない", () => {
    const original = ["A", "B", "C"];

    const moved = moveItem(original, 0, "up");

    expect(moved).toEqual(["A", "B", "C"]);
    expect(moved).not.toBe(original);
    expect(original).toEqual(["A", "B", "C"]);
  });

  test("末尾の「下へ」は同じ並びを返す", () => {
    expect(moveItem(["A", "B", "C"], 2, "down")).toEqual(["A", "B", "C"]);
  });

  test("先頭の「先頭へ」、末尾の「末尾へ」は同じ並びを返す", () => {
    expect(moveItem(["A", "B", "C"], 0, "top")).toEqual(["A", "B", "C"]);
    expect(moveItem(["A", "B", "C"], 2, "bottom")).toEqual(["A", "B", "C"]);
  });

  test("動かしても元の配列は変更しない", () => {
    const original = ["A", "B", "C"];

    moveItem(original, 2, "top");

    expect(original).toEqual(["A", "B", "C"]);
  });

  test("1要素のときは例外にならず同じ並びを返す", () => {
    expect(moveItem(["A"], 0, "up")).toEqual(["A"]);
    expect(moveItem(["A"], 0, "bottom")).toEqual(["A"]);
  });

  test("存在しない位置(負・範囲外)を指定しても例外にならず同じ並びを返す", () => {
    expect(moveItem(["A", "B"], -1, "down")).toEqual(["A", "B"]);
    expect(moveItem(["A", "B"], 2, "top")).toEqual(["A", "B"]);
    expect(moveItem([], 0, "up")).toEqual([]);
  });
});
