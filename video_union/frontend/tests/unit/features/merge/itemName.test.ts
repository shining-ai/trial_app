import { describe, expect, test } from "vitest";
import { itemName } from "../../../../src/features/merge/itemName";

describe("itemName", () => {
  test("動画はファイル名を返す", () => {
    const item = { kind: "video", id: "v1", file_name: "red.mp4", duration_seconds: 1, width: 640, height: 360 } as const;

    expect(itemName(item)).toBe("red.mp4");
  });

  test("テキストの場面(1行)は「テキストの場面: 京都」", () => {
    const item = { kind: "text", id: "text-1", text: "京都", durationTenths: 30 } as const;

    expect(itemName(item)).toBe("テキストの場面: 京都");
  });

  test("テキストの場面(2行)は1行目だけを使う", () => {
    const item = { kind: "text", id: "text-1", text: "京都\n清水寺", durationTenths: 30 } as const;

    expect(itemName(item)).toBe("テキストの場面: 京都");
  });
});
