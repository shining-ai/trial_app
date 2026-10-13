import { describe, expect, test } from "vitest";
import { countVideoItems } from "../../../../src/features/merge/countVideoItems";
import type { TextSceneItem, VideoItem } from "../../../../src/features/merge/types";

const video = (id: string): VideoItem => ({ kind: "video", id, file_name: `${id}.mp4`, duration_seconds: 1, width: 320, height: 180 });
const textScene = (id: string): TextSceneItem => ({ kind: "text", id, text: "京都", durationTenths: 30 });

describe("countVideoItems", () => {
  test("テキストの場面を数えず、動画だけを数える", () => {
    expect(countVideoItems([textScene("text-1"), video("A"), textScene("text-2"), video("B")])).toBe(2);
  });

  test("テキストの場面だけなら 0", () => {
    expect(countVideoItems([textScene("text-1"), textScene("text-2")])).toBe(0);
  });

  test("空は 0", () => {
    expect(countVideoItems([])).toBe(0);
  });
});
