import { describe, expect, test } from "vitest";
import { parseShootingDateTime } from "../../../../src/features/merge/parseShootingDateTime";

describe("parseShootingDateTime", () => {
  test("20250804_184201.mp4 は日付 20250804、キー 20250804184201", () => {
    expect(parseShootingDateTime("20250804_184201.mp4")).toEqual({ date: "20250804", key: "20250804184201" });
  });

  test("VID_20250804_184201.mp4 も読める", () => {
    expect(parseShootingDateTime("VID_20250804_184201.mp4")).toEqual({ date: "20250804", key: "20250804184201" });
  });

  test("PXL_20250804_184201123.mp4 は先頭6桁の時刻で読む", () => {
    expect(parseShootingDateTime("PXL_20250804_184201123.mp4")).toEqual({ date: "20250804", key: "20250804184201" });
  });

  test("20250804-184201.mp4 はハイフン区切りでも読める", () => {
    expect(parseShootingDateTime("20250804-184201.mp4")).toEqual({ date: "20250804", key: "20250804184201" });
  });

  test("clip.mp4 は null", () => {
    expect(parseShootingDateTime("clip.mp4")).toBeNull();
  });

  test("20251304_184201.mp4(13月)は null", () => {
    expect(parseShootingDateTime("20251304_184201.mp4")).toBeNull();
  });

  test("20250230_120000.mp4(2月30日)は null", () => {
    expect(parseShootingDateTime("20250230_120000.mp4")).toBeNull();
  });

  test("20250804_256000.mp4(25時)は null", () => {
    expect(parseShootingDateTime("20250804_256000.mp4")).toBeNull();
  });

  test("20240229_120000.mp4(うるう年の2月29日)は読める", () => {
    expect(parseShootingDateTime("20240229_120000.mp4")).toEqual({ date: "20240229", key: "20240229120000" });
  });

  test("20250229_120000.mp4(平年の2月29日)は null", () => {
    expect(parseShootingDateTime("20250229_120000.mp4")).toBeNull();
  });

  test("21000229_120000.mp4(100の倍数で400の倍数でない年の2月29日)は null", () => {
    expect(parseShootingDateTime("21000229_120000.mp4")).toBeNull();
  });

  test("20000229_120000.mp4(400の倍数の年の2月29日)は読める", () => {
    expect(parseShootingDateTime("20000229_120000.mp4")).toEqual({ date: "20000229", key: "20000229120000" });
  });

  test("20250431_120000.mp4(4月31日)は null", () => {
    expect(parseShootingDateTime("20250431_120000.mp4")).toBeNull();
  });

  test("20250800_120000.mp4(0日)と 20250004_120000.mp4(0月)は null", () => {
    expect(parseShootingDateTime("20250800_120000.mp4")).toBeNull();
    expect(parseShootingDateTime("20250004_120000.mp4")).toBeNull();
  });

  test("時刻の境界: 000000 と 235959 は読め、240000・236000・235960 は null", () => {
    expect(parseShootingDateTime("20250804_235959.mp4")).toEqual({ date: "20250804", key: "20250804235959" });
    expect(parseShootingDateTime("20250804_000000.mp4")).toEqual({ date: "20250804", key: "20250804000000" });
    expect(parseShootingDateTime("20250804_240000.mp4")).toBeNull();
    expect(parseShootingDateTime("20250804_236000.mp4")).toBeNull();
    expect(parseShootingDateTime("20250804_235960.mp4")).toBeNull();
  });

  test("最初の一致だけを見る(最初が不正なら、あとに正しいものがあっても null)", () => {
    expect(parseShootingDateTime("20251304_184201_20250804_184201.mp4")).toBeNull();
    expect(parseShootingDateTime("20250101_010101_20250804_184201.mp4")).toEqual({ date: "20250101", key: "20250101010101" });
  });
});
