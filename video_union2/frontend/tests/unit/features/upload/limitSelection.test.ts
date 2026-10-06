import { describe, expect, test } from "vitest";
import { limitSelection, remainingSlots } from "../../../../src/features/upload/limitSelection";

describe("limitSelection", () => {
  test("残り枠3で5ファイル選ぶと、先頭3ファイルを残し2ファイルを切り捨てる", () => {
    const result = limitSelection(["a", "b", "c", "d", "e"], 3);

    expect(result).toEqual({ accepted: ["a", "b", "c"], discardedCount: 2 });
  });

  test("残り枠0なら全部切り捨てる", () => {
    const result = limitSelection(["a", "b"], 0);

    expect(result).toEqual({ accepted: [], discardedCount: 2 });
  });

  test("残り枠以内ならそのまま残し、切り捨ては0", () => {
    expect(limitSelection(["a", "b", "c"], 3)).toEqual({ accepted: ["a", "b", "c"], discardedCount: 0 });
    expect(limitSelection(["a"], 5)).toEqual({ accepted: ["a"], discardedCount: 0 });
  });

  test("残り枠が負の値でも全部切り捨てる", () => {
    expect(limitSelection(["a"], -1)).toEqual({ accepted: [], discardedCount: 1 });
  });
});

describe("remainingSlots", () => {
  test("結合リスト90本・送信中2本・待機中6本なら残り枠2", () => {
    expect(remainingSlots({ mergeCount: 90, uploadingCount: 2, pendingCount: 6 })).toBe(2);
  });

  test("結合リスト99本なら残り枠1", () => {
    expect(remainingSlots({ mergeCount: 99, uploadingCount: 0, pendingCount: 0 })).toBe(1);
  });

  test("結合リスト100本なら残り枠0", () => {
    expect(remainingSlots({ mergeCount: 100, uploadingCount: 0, pendingCount: 0 })).toBe(0);
  });

  test("合計が100本を超えていても残り枠は負にならない", () => {
    expect(remainingSlots({ mergeCount: 100, uploadingCount: 2, pendingCount: 1 })).toBe(0);
  });

  test("何もないときは残り枠100", () => {
    expect(remainingSlots({ mergeCount: 0, uploadingCount: 0, pendingCount: 0 })).toBe(100);
  });
});
