import { describe, expect, test } from "vitest";
import { pickNextUploads } from "../../../../src/features/upload/pickNextUploads";
import type { UploadItem, UploadStatus } from "../../../../src/features/upload/types";

function item(key: string, status: UploadStatus): UploadItem {
  return { key, file: new File(["x"], `${key}.mp4`), status, progress: 0 };
}

function keysOf(items: UploadItem[]): string[] {
  return items.map((picked) => picked.key);
}

describe("pickNextUploads", () => {
  test("送信中0本なら、待機中の先頭2本を選ぶ", () => {
    const items = [item("a", "pending"), item("b", "pending"), item("c", "pending")];

    expect(keysOf(pickNextUploads(items))).toEqual(["a", "b"]);
  });

  test("送信中1本なら、待機中の先頭1本を選ぶ", () => {
    const items = [item("a", "uploading"), item("b", "pending"), item("c", "pending")];

    expect(keysOf(pickNextUploads(items))).toEqual(["b"]);
  });

  test("送信中2本なら、何も選ばない", () => {
    const items = [item("a", "uploading"), item("b", "uploading"), item("c", "pending")];

    expect(pickNextUploads(items)).toEqual([]);
  });

  test("待機中が1本だけなら、その1本だけを選ぶ", () => {
    expect(keysOf(pickNextUploads([item("a", "pending")]))).toEqual(["a"]);
  });

  test("完了・失敗の項目は送信中にも待機中にも数えない", () => {
    const items = [item("a", "done"), item("b", "failed"), item("c", "pending"), item("d", "pending"), item("e", "pending")];

    expect(keysOf(pickNextUploads(items))).toEqual(["c", "d"]);
  });

  test("選ぶ順は、待機中に入った順", () => {
    const items = [item("z", "pending"), item("a", "pending")];

    expect(keysOf(pickNextUploads(items))).toEqual(["z", "a"]);
  });
});
