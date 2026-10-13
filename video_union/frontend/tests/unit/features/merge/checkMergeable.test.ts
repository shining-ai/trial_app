import { describe, expect, test } from "vitest";
import { checkMergeable } from "../../../../src/features/merge/checkMergeable";

const NEED_VIDEO = "結合するには動画が1本以上必要です";
const NEED_TWO = "結合するには動画とテキストの場面を合わせて2つ以上必要です";
const EDITING = "テキストの入力を確定するか取り消してください";

describe("checkMergeable", () => {
  test("2本・合計1800秒ちょうどは結合できる", () => {
    expect(checkMergeable({ videoCount: 2, itemCount: 2, isEditing: false, totalSeconds: 1800, isMerging: false })).toEqual({
      mergeable: true,
      reason: null,
      message: null,
      excessSeconds: 0,
    });
  });

  test("動画1本だけは「結合するには動画とテキストの場面を合わせて2つ以上必要です」", () => {
    const check = checkMergeable({ videoCount: 1, itemCount: 1, isEditing: false, totalSeconds: 10, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("too_few");
    expect(check.message).toBe(NEED_TWO);
  });

  test("動画0本・項目0は「結合するには動画が1本以上必要です」", () => {
    const check = checkMergeable({ videoCount: 0, itemCount: 0, isEditing: false, totalSeconds: 0, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("no_video");
    expect(check.message).toBe(NEED_VIDEO);
  });

  test("動画1本 + テキストの場面1つは結合できる", () => {
    expect(
      checkMergeable({ videoCount: 1, itemCount: 2, isEditing: false, totalSeconds: 13, isMerging: false }),
    ).toEqual({ mergeable: true, reason: null, message: null, excessSeconds: 0 });
  });

  test("テキストの場面2つだけ(動画0本)は「結合するには動画が1本以上必要です」", () => {
    const check = checkMergeable({ videoCount: 0, itemCount: 2, isEditing: false, totalSeconds: 6, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("no_video");
    expect(check.message).toBe(NEED_VIDEO);
  });

  test("入力欄が開いているときは不可で「テキストの入力を確定するか取り消してください」", () => {
    const check = checkMergeable({ videoCount: 2, itemCount: 2, isEditing: true, totalSeconds: 10, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("editing");
    expect(check.message).toBe(EDITING);
  });

  test("長さ: 動画1790秒 + テキストの場面10.0秒(合計1800秒)は結合できる", () => {
    const check = checkMergeable({ videoCount: 1, itemCount: 2, isEditing: false, totalSeconds: 1790 + 10.0, isMerging: false });

    expect(check.mergeable).toBe(true);
  });

  test("長さ: 動画1790秒 + テキストの場面10.1秒は不可で、超過0.1秒、message は「30分を1秒超えています」", () => {
    const check = checkMergeable({ videoCount: 1, itemCount: 2, isEditing: false, totalSeconds: 1790 + 10.1, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("too_long");
    expect(check.excessSeconds).toBe(0.1);
    expect(check.message).toBe("結合後の長さが30分を1秒超えています");
  });

  test("合計1800.001秒は不可で、超過0.001秒と理由を返す", () => {
    const check = checkMergeable({ videoCount: 2, itemCount: 2, isEditing: false, totalSeconds: 1800.001, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("too_long");
    expect(check.message).toBe("結合後の長さが30分を1秒超えています");
    expect(check.excessSeconds).toBe(0.001);
  });

  test("合計1935秒は超過135秒で「2分15秒」", () => {
    const check = checkMergeable({ videoCount: 2, itemCount: 2, isEditing: false, totalSeconds: 1935, isMerging: false });

    expect(check.excessSeconds).toBe(135);
    expect(check.message).toBe("結合後の長さが30分を2分15秒超えています");
  });

  test("浮動小数の誤差が出る合計 [600.1, 600.2, 599.7] は結合できる", () => {
    const totalSeconds = [600.1, 600.2, 599.7].reduce((sum, seconds) => sum + seconds, 0);

    const check = checkMergeable({ videoCount: 3, itemCount: 3, isEditing: false, totalSeconds, isMerging: false });

    expect(check.mergeable).toBe(true);
    expect(check.excessSeconds).toBe(0);
  });

  test("[600.1, 600.2, 599.701] は不可(ミリ秒に丸めて比べる)", () => {
    const totalSeconds = [600.1, 600.2, 599.701].reduce((sum, seconds) => sum + seconds, 0);

    const check = checkMergeable({ videoCount: 3, itemCount: 3, isEditing: false, totalSeconds, isMerging: false });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("too_long");
    expect(check.excessSeconds).toBe(0.001);
  });

  test("結合中は不可", () => {
    const check = checkMergeable({ videoCount: 2, itemCount: 2, isEditing: false, totalSeconds: 10, isMerging: true });

    expect(check.mergeable).toBe(false);
    expect(check.reason).toBe("merging");
    expect(check.message).toBe("結合中です");
  });

  test("結合中と動画0本が重なるときは、結合中を返す", () => {
    const check = checkMergeable({ videoCount: 0, itemCount: 1, isEditing: false, totalSeconds: 10, isMerging: true });

    expect(check.reason).toBe("merging");
  });

  test("結合中と編集中が重なるときは、結合中を返す", () => {
    const check = checkMergeable({ videoCount: 2, itemCount: 2, isEditing: true, totalSeconds: 10, isMerging: true });

    expect(check.reason).toBe("merging");
  });

  test("編集中と動画0本が重なるときは、編集中を返す", () => {
    const check = checkMergeable({ videoCount: 0, itemCount: 0, isEditing: true, totalSeconds: 0, isMerging: false });

    expect(check.reason).toBe("editing");
  });

  test("動画0本と合わせて1つ以下が重なるときは、動画0本を返す", () => {
    const check = checkMergeable({ videoCount: 0, itemCount: 1, isEditing: false, totalSeconds: 3, isMerging: false });

    expect(check.reason).toBe("no_video");
  });

  test("編集中と長さ超過が重なるときは、編集中を返す(超過時間は返す)", () => {
    const check = checkMergeable({ videoCount: 2, itemCount: 2, isEditing: true, totalSeconds: 1935, isMerging: false });

    expect(check.reason).toBe("editing");
    expect(check.excessSeconds).toBe(135);
  });

  test("合わせて1つ以下と長さ超過が重なるときは、合わせて1つ以下を返す(超過時間は返す)", () => {
    const check = checkMergeable({ videoCount: 1, itemCount: 1, isEditing: false, totalSeconds: 1935, isMerging: false });

    expect(check.reason).toBe("too_few");
    expect(check.excessSeconds).toBe(135);
  });

  test("結合中と長さ超過が重なるときは、結合中を返す(超過時間は返す)", () => {
    const check = checkMergeable({ videoCount: 2, itemCount: 2, isEditing: false, totalSeconds: 1935, isMerging: true });

    expect(check.reason).toBe("merging");
    expect(check.excessSeconds).toBe(135);
  });
});
