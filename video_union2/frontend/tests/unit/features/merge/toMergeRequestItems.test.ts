import { describe, expect, test } from "vitest";
import { toMergeRequestItems } from "../../../../src/features/merge/toMergeRequestItems";
import type { TextSceneItem, VideoItem } from "../../../../src/features/merge/types";

const video = (id: string): VideoItem => ({ kind: "video", id, file_name: `${id}.mp4`, duration_seconds: 1, width: 320, height: 180 });
const textScene = (id: string, text: string, durationTenths: number): TextSceneItem => ({ kind: "text", id, text, durationTenths });

describe("toMergeRequestItems", () => {
  test("並び順どおりに、動画は video_id、テキストの場面は text と duration_tenths の形にする", () => {
    const items = [textScene("text-1", "京都\n嵐山", 30), video("a".repeat(32)), textScene("text-2", "終", 55)];

    expect(toMergeRequestItems(items)).toEqual([
      { type: "text", text: "京都\n嵐山", duration_tenths: 30 },
      { type: "video", video_id: "a".repeat(32) },
      { type: "text", text: "終", duration_tenths: 55 },
    ]);
  });

  test("空は空", () => {
    expect(toMergeRequestItems([])).toEqual([]);
  });
});
