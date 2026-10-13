import { describe, expect, test } from "vitest";
import { summarizeSceneText } from "../../../../src/features/merge/summarizeSceneText";

describe("summarizeSceneText", () => {
  test("1行はそのままで、続きなし", () => {
    expect(summarizeSceneText("京都")).toEqual({ firstLine: "京都", hasMore: false });
  });

  test("2行以上は1行目と、続きあり", () => {
    expect(summarizeSceneText("2026年10月9日\n京都 嵐山")).toEqual({ firstLine: "2026年10月9日", hasMore: true });
    expect(summarizeSceneText("京都\n\n嵐山\n山\n年")).toEqual({ firstLine: "京都", hasMore: true });
  });
});
