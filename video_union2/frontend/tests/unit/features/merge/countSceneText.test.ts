import { describe, expect, test } from "vitest";
import { countSceneText } from "../../../../src/features/merge/countSceneText";

describe("countSceneText", () => {
  test("空の入力は0行・0文字", () => {
    expect(countSceneText("")).toEqual({ lineCount: 0, charCount: 0 });
  });

  test("空白と改行だけの入力は0行・0文字", () => {
    expect(countSceneText(" \n　\n")).toEqual({ lineCount: 0, charCount: 0 });
  });

  test("「京都\\n嵐山」は2行・4文字(改行を文字に数えない)", () => {
    expect(countSceneText("京都\n嵐山")).toEqual({ lineCount: 2, charCount: 4 });
  });

  test("CRLF の改行も1つの改行として数える", () => {
    expect(countSceneText("京都\r\n嵐山")).toEqual({ lineCount: 2, charCount: 4 });
  });

  test("前後の空白・空行は数えず、途中の空行は1行として数える", () => {
    expect(countSceneText("\n 京都\n\n嵐山 \n")).toEqual({ lineCount: 3, charCount: 4 });
  });

  test("サロゲートペアの文字(𠮷)は1文字と数える", () => {
    expect(countSceneText("𠮷𠮷")).toEqual({ lineCount: 1, charCount: 2 });
  });

  test("上限を超えても数える(6行は6行、101文字は101文字)", () => {
    expect(countSceneText("a\nb\nc\nd\ne\nf")).toEqual({ lineCount: 6, charCount: 6 });
    expect(countSceneText("a".repeat(101))).toEqual({ lineCount: 1, charCount: 101 });
  });
});
