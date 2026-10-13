import { describe, expect, test } from "vitest";
import { sortByShootingDateTime } from "../../../../src/features/merge/sortByShootingDateTime";
import type { MergeItem } from "../../../../src/features/merge/types";

function video(id: string, fileName: string): MergeItem {
  return { kind: "video", id, file_name: fileName, duration_seconds: 1, width: 640, height: 360 };
}

function text(id: string, body = "京都"): MergeItem {
  return { kind: "text", id, text: body, durationTenths: 30 };
}

function ids(items: MergeItem[]): string[] {
  return items.map((item) => item.id);
}

describe("sortByShootingDateTime", () => {
  test("受け入れシナリオ: 8/5 12時・8/4 9時・8/4 18時の順の3本が [8/4 9時, 8/4 18時, 8/5 12時] になる", () => {
    const items = [
      video("blue", "20250805_120000.mp4"),
      video("red", "20250804_090000.mp4"),
      video("green", "20250804_180000.mp4"),
    ];

    expect(ids(sortByShootingDateTime(items))).toEqual(["red", "green", "blue"]);
  });

  test("テキストの場面は直後の動画と一緒に動く", () => {
    const items = [
      video("A", "20250805_120000.mp4"),
      text("T"),
      video("B", "20250804_090000.mp4"),
    ];

    expect(ids(sortByShootingDateTime(items))).toEqual(["T", "B", "A"]);
  });

  test("連続するテキストの場面も、まとめて直後の動画と一緒に動く", () => {
    const items = [
      video("A", "20250805_120000.mp4"),
      text("T1"),
      text("T2"),
      video("B", "20250804_090000.mp4"),
    ];

    expect(ids(sortByShootingDateTime(items))).toEqual(["T1", "T2", "B", "A"]);
  });

  test("最後の動画より後ろのテキストの場面は末尾のまま", () => {
    const items = [
      video("A", "20250805_120000.mp4"),
      video("B", "20250804_090000.mp4"),
      text("END"),
    ];

    expect(ids(sortByShootingDateTime(items))).toEqual(["B", "A", "END"]);
  });

  test("読めない動画は、読める動画の後ろに元の順で並ぶ", () => {
    const items = [
      video("X", "clip1.mp4"),
      video("A", "20250805_120000.mp4"),
      video("Y", "clip2.mp4"),
      video("B", "20250804_090000.mp4"),
    ];

    expect(ids(sortByShootingDateTime(items))).toEqual(["B", "A", "X", "Y"]);
  });

  test("読めない動画に付いたテキストの場面も、その動画と一緒に後ろへ動く", () => {
    const items = [
      text("T"),
      video("X", "clip.mp4"),
      video("A", "20250805_120000.mp4"),
    ];

    expect(ids(sortByShootingDateTime(items))).toEqual(["A", "T", "X"]);
  });

  test("同じ撮影日時の動画は元の順のまま", () => {
    const items = [
      video("A", "20250804_090000.mp4"),
      video("B", "20250804_090000.mp4"),
      video("C", "20250803_090000.mp4"),
    ];

    expect(ids(sortByShootingDateTime(items))).toEqual(["C", "A", "B"]);
  });

  test("元の配列を変えない", () => {
    const items = [
      video("A", "20250805_120000.mp4"),
      video("B", "20250804_090000.mp4"),
    ];

    const result = sortByShootingDateTime(items);

    expect(ids(items)).toEqual(["A", "B"]);
    expect(result).not.toBe(items);
  });

  test("空の配列は空の配列を返す", () => {
    expect(sortByShootingDateTime([])).toEqual([]);
  });

  test("動画がなくテキストの場面だけなら、そのままの順", () => {
    const items = [text("T1"), text("T2")];

    expect(ids(sortByShootingDateTime(items))).toEqual(["T1", "T2"]);
  });

  test("日付の見出しは、後ろの動画ではなくその日の最初の動画の前へ並べ直す(新しくは作らない)", () => {
    // 見出しを入れたあとに、同じ日のもっと早い動画(7時)を末尾に足した状態
    const items = [
      text("H4", "2025年8月4日"),
      video("v09", "20250804_090000.mp4"),
      video("v18", "20250804_180000.mp4"),
      text("H5", "2025年8月5日"),
      video("v12", "20250805_120000.mp4"),
      video("v07", "20250804_070000.mp4"),
    ];

    expect(ids(sortByShootingDateTime(items))).toEqual(["H4", "v07", "v09", "v18", "H5", "v12"]);
  });

  test("その日の動画を全部消して残った日付の見出しは、並べても次の日の見出しと入れ替わらない", () => {
    const items = [text("H4", "2025年8月4日"), text("H5", "2025年8月5日"), video("v12", "20250805_120000.mp4")];

    expect(ids(sortByShootingDateTime(items))).toEqual(["H4", "H5", "v12"]);
  });

  test("同じ日付の見出しが2つ以上あれば、並べるときも並べたあとの順で最初の1つにまとめる", () => {
    const items = [
      text("A", "2025年8月4日"),
      video("v09", "20250804_090000.mp4"),
      text("B", "2025年8月4日"),
      video("v07", "20250804_070000.mp4"),
    ];

    // 並べたあとの順で最初の見出し(7時の動画に付いていた B)を残す
    expect(ids(sortByShootingDateTime(items))).toEqual(["B", "v07", "v09"]);
  });

  test("最後の動画より後ろにある日付の見出しも、その日の最初の動画の前へ置き直す", () => {
    const items = [video("v07", "20250804_070000.mp4"), text("H4", "2025年8月4日")];

    expect(ids(sortByShootingDateTime(items))).toEqual(["H4", "v07"]);
  });

  test("見出しのない日には、並べるだけでは見出しを作らない", () => {
    const items = [video("v12", "20250805_120000.mp4"), video("v07", "20250804_070000.mp4")];

    expect(ids(sortByShootingDateTime(items))).toEqual(["v07", "v12"]);
  });
});
