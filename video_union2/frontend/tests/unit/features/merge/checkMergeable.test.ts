import { describe, expect, test } from "vitest";
import { checkMergeable } from "../../../../src/features/merge/checkMergeable";

const TOO_FEW = "結合するには2本以上の動画が必要です";

describe("checkMergeable", () => {
  test("2本・合計1800秒ちょうどは結合できる", () => {
    expect(checkMergeable({ count: 2, totalSeconds: 1800, isMerging: false })).toEqual({
      mergeable: true,
      reason: null,
      message: null,
      excessSeconds: 0,
    });
  });

  test("1本は「結合するには2本以上の動画が必要です」", () => {
    const check = checkMergeable({ count: 1, totalSeconds: 10, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("too_few");
    expect(check.message).toBe(TOO_FEW);
  });

  test("0本は「結合するには2本以上の動画が必要です」", () => {
    const check = checkMergeable({ count: 0, totalSeconds: 0, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.message).toBe(TOO_FEW);
  });

  test("合計1800.001秒は不可で、超過0.001秒と理由を返す", () => {
    const check = checkMergeable({ count: 2, totalSeconds: 1800.001, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("too_long");
    expect(check.message).toBe("結合後の長さが30分を1秒超えています");
    expect(check.excessSeconds).toBe(0.001);
  });

  test("合計1935秒は超過135秒で「2分15秒」", () => {
    const check = checkMergeable({ count: 2, totalSeconds: 1935, isMerging: false });

    expect(check.excessSeconds).toBe(135);
    expect(check.message).toBe("結合後の長さが30分を2分15秒超えています");
  });

  test("浮動小数の誤差が出る合計 [600.1, 600.2, 599.7] は結合できる", () => {
    const totalSeconds = [600.1, 600.2, 599.7].reduce((sum, seconds) => sum + seconds, 0);

    const check = checkMergeable({ count: 3, totalSeconds, isMerging: false });

    expect(check.mergeable).toBe(true);
    expect(check.excessSeconds).toBe(0);
  });

  test("[600.1, 600.2, 599.701] は不可(ミリ秒に丸めて比べる)", () => {
    const totalSeconds = [600.1, 600.2, 599.701].reduce((sum, seconds) => sum + seconds, 0);

    const check = checkMergeable({ count: 3, totalSeconds, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("too_long");
    expect(check.excessSeconds).toBe(0.001);
  });

  test("結合中は不可", () => {
    const check = checkMergeable({ count: 2, totalSeconds: 10, isMerging: true });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("merging");
    expect(check.message).toBe("結合中です");
  });

  test("結合中と本数不足が重なるときは、結合中を返す", () => {
    const check = checkMergeable({ count: 1, totalSeconds: 10, isMerging: true });

    expect(check.reason).toBe("merging");
  });

  test("本数不足と長さ超過が重なるときは、本数不足を返す(超過時間は返す)", () => {
    const check = checkMergeable({ count: 1, totalSeconds: 1935, isMerging: false });

    expect(check.reason).toBe("too_few");
    expect(check.excessSeconds).toBe(135);
  });

  test("結合中と長さ超過が重なるときは、結合中を返す(超過時間は返す)", () => {
    const check = checkMergeable({ count: 2, totalSeconds: 1935, isMerging: true });

    expect(check.reason).toBe("merging");
    expect(check.excessSeconds).toBe(135);
  });
});
