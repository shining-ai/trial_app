import { describe, expect, test } from "vitest";
import { replaceItem } from "../../../../src/features/merge/replaceItem";
import type { MergeItem, TextSceneItem, VideoItem } from "../../../../src/features/merge/types";

const video = (id: string): VideoItem => ({ kind: "video", id, file_name: `${id}.mp4`, duration_seconds: 1, width: 320, height: 180 });
const textScene = (id: string, text: string): TextSceneItem => ({ kind: "text", id, text, durationTenths: 30 });

describe("replaceItem", () => {
  test("指定の id の項目を置き換え、位置は変わらない", () => {
    const items: MergeItem[] = [video("A"), textScene("text-1", "旧"), video("B")];

    const result = replaceItem(items, "text-1", textScene("text-1", "新"));

    expect(result).toEqual([video("A"), textScene("text-1", "新"), video("B")]);
  });

  test("存在しない id のときは同じ並びを返す", () => {
    const items: MergeItem[] = [video("A"), textScene("text-1", "旧")];

    expect(replaceItem(items, "missing", textScene("text-9", "新"))).toEqual(items);
  });

  test("元の配列は変更しない", () => {
    const items: MergeItem[] = [video("A"), textScene("text-1", "旧")];

    const result = replaceItem(items, "text-1", textScene("text-1", "新"));

    expect(result).not.toBe(items);
    expect(items[1]).toEqual(textScene("text-1", "旧"));
  });
});
