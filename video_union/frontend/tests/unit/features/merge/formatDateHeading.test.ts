import { describe, expect, test } from "vitest";
import { formatDateHeading } from "../../../../src/features/merge/formatDateHeading";

describe("formatDateHeading", () => {
  test("20250804 は「2025年8月4日」(月・日を0で埋めない)", () => {
    expect(formatDateHeading("20250804")).toBe("2025年8月4日");
  });

  test("20251231 は「2025年12月31日」", () => {
    expect(formatDateHeading("20251231")).toBe("2025年12月31日");
  });

  test("20250101 は「2025年1月1日」", () => {
    expect(formatDateHeading("20250101")).toBe("2025年1月1日");
  });
});
