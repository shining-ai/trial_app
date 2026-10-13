import { describe, expect, test } from "vitest";
import { insertDateHeadings } from "../../../../src/features/merge/insertDateHeadings";
import type { MergeItem } from "../../../../src/features/merge/types";

function video(id: string, fileName: string): MergeItem {
  return { kind: "video", id, file_name: fileName, duration_seconds: 1, width: 640, height: 360 };
}

function text(id: string, body: string, durationTenths = 30): MergeItem {
  return { kind: "text", id, text: body, durationTenths };
}

function counter(): () => string {
  let n = 0;
  return () => `h-${(n += 1)}`;
}

describe("insertDateHeadings", () => {
  test("受け入れシナリオ: 2日分の動画に、日が変わる位置で表示時間10の見出しが2つ入る", () => {
    const items = [
      video("red", "20250804_090000.mp4"),
      video("green", "20250804_180000.mp4"),
      video("blue", "20250805_120000.mp4"),
    ];

    expect(insertDateHeadings(items, counter())).toEqual([
      text("h-1", "2025年8月4日", 10),
      video("red", "20250804_090000.mp4"),
      video("green", "20250804_180000.mp4"),
      text("h-2", "2025年8月5日", 10),
      video("blue", "20250805_120000.mp4"),
    ]);
  });

  test("2回目に呼んでも増えず、同じ並びのまま", () => {
    const items = [
      video("red", "20250804_090000.mp4"),
      video("green", "20250804_180000.mp4"),
      video("blue", "20250805_120000.mp4"),
    ];
    const once = insertDateHeadings(items, counter());

    const twice = insertDateHeadings(once, counter());

    expect(twice).toEqual(once);
  });

  test("読めない動画には見出しを付けない", () => {
    const items = [video("X", "clip.mp4")];

    expect(insertDateHeadings(items, counter())).toEqual([video("X", "clip.mp4")]);
  });

  test("読めない動画を挟んでも、日付が同じなら見出しは増えない", () => {
    const items = [
      video("A", "20250804_090000.mp4"),
      video("X", "clip.mp4"),
      video("B", "20250804_180000.mp4"),
    ];

    expect(insertDateHeadings(items, counter())).toEqual([
      text("h-1", "2025年8月4日", 10),
      video("A", "20250804_090000.mp4"),
      video("X", "clip.mp4"),
      video("B", "20250804_180000.mp4"),
    ]);
  });

  test("読めない動画の後ろで日付が変われば、その動画に見出しを入れる", () => {
    const items = [
      video("A", "20250804_090000.mp4"),
      video("X", "clip.mp4"),
      video("B", "20250805_090000.mp4"),
    ];

    expect(insertDateHeadings(items, counter())).toEqual([
      text("h-1", "2025年8月4日", 10),
      video("A", "20250804_090000.mp4"),
      video("X", "clip.mp4"),
      text("h-2", "2025年8月5日", 10),
      video("B", "20250805_090000.mp4"),
    ]);
  });

  test("手で入れた別の文の見出しが直前にあっても、日付の見出しをそのかたまりの前に入れる", () => {
    const items = [text("T", "京都"), video("V", "20250805_090000.mp4")];

    expect(insertDateHeadings(items, counter())).toEqual([
      text("h-1", "2025年8月5日", 10),
      text("T", "京都"),
      video("V", "20250805_090000.mp4"),
    ]);
  });

  test("直前のかたまりに同じ文のテキストの場面が1つでもあれば入れない", () => {
    const items = [
      text("D", "2025年8月5日"),
      text("T", "京都"),
      video("V", "20250805_090000.mp4"),
    ];

    expect(insertDateHeadings(items, counter())).toEqual(items);
  });

  test("日付が同じ動画が続く間は、間に手で入れたテキストの場面があっても見出しを入れない", () => {
    const items = [
      text("D", "2025年8月4日"),
      video("A", "20250804_090000.mp4"),
      text("T", "京都"),
      video("B", "20250804_180000.mp4"),
    ];

    expect(insertDateHeadings(items, counter())).toEqual(items);
  });

  test("別の日付の見出しが直前にあるだけなら、日付の見出しを入れる", () => {
    const items = [text("D", "2025年8月4日"), video("V", "20250805_090000.mp4")];

    expect(insertDateHeadings(items, counter())).toEqual([
      text("h-1", "2025年8月5日", 10),
      text("D", "2025年8月4日"),
      video("V", "20250805_090000.mp4"),
    ]);
  });

  test("元の配列を変えない", () => {
    const items = [video("A", "20250804_090000.mp4")];

    const result = insertDateHeadings(items, counter());

    expect(items).toEqual([video("A", "20250804_090000.mp4")]);
    expect(result).not.toBe(items);
  });

  test("id は渡した関数から取り、入れるときにだけ呼ぶ", () => {
    const ids = ["text-7", "text-8"];
    let calls = 0;
    const nextId = () => ids[calls++];
    const items = [
      video("A", "20250804_090000.mp4"),
      video("B", "20250804_100000.mp4"),
      video("C", "20250805_090000.mp4"),
    ];

    const result = insertDateHeadings(items, nextId);

    expect(result.map((item) => item.id)).toEqual(["text-7", "A", "B", "text-8", "C"]);
    expect(calls).toBe(2);
  });

  test("見出しを入れる必要がなければ nextId を呼ばない", () => {
    let calls = 0;
    const nextId = () => `h-${(calls += 1)}`;

    insertDateHeadings([video("X", "clip.mp4")], nextId);

    expect(calls).toBe(0);
  });

  test("空の配列は空の配列を返す", () => {
    expect(insertDateHeadings([], counter())).toEqual([]);
  });

  test("日の途中に取り残された日付の見出しは、作り直さずにその日の最初の動画の前へ移す(表示時間と id は保つ)", () => {
    // 見出しを入れたあとに、同じ日のもっと早い動画(7時)を足して並べた状態
    const items = [
      video("v07", "20250804_070000.mp4"),
      text("H4", "2025年8月4日", 25),
      video("v09", "20250804_090000.mp4"),
      video("v18", "20250804_180000.mp4"),
      text("H5", "2025年8月5日", 10),
      video("v12", "20250805_120000.mp4"),
    ];

    expect(insertDateHeadings(items, counter())).toEqual([
      text("H4", "2025年8月4日", 25),
      video("v07", "20250804_070000.mp4"),
      video("v09", "20250804_090000.mp4"),
      video("v18", "20250804_180000.mp4"),
      text("H5", "2025年8月5日", 10),
      video("v12", "20250805_120000.mp4"),
    ]);
  });

  test("同じ日付の見出しが2つ以上あれば、最初の1つにまとめる", () => {
    const items = [
      text("A", "2025年8月4日", 20),
      video("v07", "20250804_070000.mp4"),
      text("B", "2025年8月4日", 10),
      video("v09", "20250804_090000.mp4"),
    ];

    expect(insertDateHeadings(items, counter())).toEqual([
      text("A", "2025年8月4日", 20),
      video("v07", "20250804_070000.mp4"),
      video("v09", "20250804_090000.mp4"),
    ]);
  });

  test("動画のない日付の見出し(手で入れたものなど)は、ふつうのテキストの場面として残す", () => {
    const items = [text("X", "2025年1月1日"), video("v07", "20250804_070000.mp4")];

    expect(insertDateHeadings(items, counter())).toEqual([
      text("h-1", "2025年8月4日", 10),
      text("X", "2025年1月1日"),
      video("v07", "20250804_070000.mp4"),
    ]);
  });
});
