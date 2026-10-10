import { describe, expect, test } from "vitest";
import { dragEndToMove } from "../../../../src/features/merge/dragEndToMove";

describe("dragEndToMove", () => {
  test("離した先(over)がないときは null", () => {
    expect(dragEndToMove("a", null, false)).toBeNull();
  });

  test("同じ id の上で離したときは null", () => {
    expect(dragEndToMove("a", "a", false)).toBeNull();
  });

  test("別の id の上で離したときは動かす内容を返す", () => {
    expect(dragEndToMove("c", "a", false)).toEqual({ activeId: "c", overId: "a" });
  });

  test("ロック中は別の id の上で離しても null", () => {
    expect(dragEndToMove("c", "a", true)).toBeNull();
  });
});
