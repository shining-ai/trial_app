import { describe, expect, test } from "vitest";
import { insertItemAfter } from "../../../../src/features/merge/insertItemAfter";
import type { MergeItem, TextSceneItem, VideoItem } from "../../../../src/features/merge/types";

const video = (id: string): VideoItem => ({ kind: "video", id, file_name: `${id}.mp4`, duration_seconds: 1, width: 320, height: 180 });
const text: TextSceneItem = { kind: "text", id: "text-1", text: "京都", durationTenths: 30 };
const ids = (items: MergeItem[] | null) => items?.map((item) => item.id);

describe("insertItemAfter", () => {
  const items = [video("A"), video("B")];

  test("null を指定すると先頭に入る", () => {
    expect(ids(insertItemAfter(items, null, text))).toEqual(["text-1", "A", "B"]);
  });

  test("指定の id の項目の後に入る", () => {
    expect(ids(insertItemAfter(items, "A", text))).toEqual(["A", "text-1", "B"]);
  });

  test("末尾の項目の後に入ると末尾になる", () => {
    expect(ids(insertItemAfter(items, "B", text))).toEqual(["A", "B", "text-1"]);
  });

  test("空の配列の先頭に入れられる", () => {
    expect(ids(insertItemAfter([], null, text))).toEqual(["text-1"]);
  });

  test("存在しない id の後は null を返す", () => {
    expect(insertItemAfter(items, "missing", text)).toBeNull();
  });

  test("元の配列は変更しない", () => {
    const original = [video("A"), video("B")];

    const result = insertItemAfter(original, "A", text);

    expect(result).not.toBe(original);
    expect(ids(original)).toEqual(["A", "B"]);
  });
});
