import { describe, expect, test } from "vitest";
import { sumMergeItemsMilliseconds } from "../../../../src/features/merge/sumMergeItemsMilliseconds";
import type { TextSceneItem, VideoItem } from "../../../../src/features/merge/types";

const video = (id: string, duration_seconds: number): VideoItem => ({ kind: "video", id, file_name: `${id}.mp4`, duration_seconds, width: 320, height: 180 });
const textScene = (durationTenths: number): TextSceneItem => ({ kind: "text", id: "text-1", text: "京都", durationTenths });

describe("sumMergeItemsMilliseconds", () => {
  test("動画 1.5秒 + テキストの場面 55(5.5秒)は 7000ミリ秒", () => {
    expect(sumMergeItemsMilliseconds([video("A", 1.5), textScene(55)])).toBe(7000);
  });

  test("動画 [600.1, 600.2] + テキストの場面 5997 は 1800000(サーバーの validate_merge_request と同じ入力と値)", () => {
    expect(sumMergeItemsMilliseconds([video("A", 600.1), video("B", 600.2), textScene(5997)])).toBe(1800000);
  });

  test("動画の長さは1本ずつ0.5ミリ秒を切り上げてから足す", () => {
    expect(sumMergeItemsMilliseconds([video("A", 0.0005), video("B", 0.0005)])).toBe(2);
  });

  test("テキストの場面だけでも合計できる", () => {
    expect(sumMergeItemsMilliseconds([textScene(10), textScene(600)])).toBe(61000);
  });

  test("空は 0", () => {
    expect(sumMergeItemsMilliseconds([])).toBe(0);
  });
});
