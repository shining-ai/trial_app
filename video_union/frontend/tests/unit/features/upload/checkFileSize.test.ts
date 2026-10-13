import { expect, test } from "vitest";
import { checkFileSize } from "../../../../src/features/upload/checkFileSize";

test("4294967296 バイト(4GBちょうど)は許可する", () => {
  expect(checkFileSize(4294967296)).toBe(true);
});

test("4294967297 バイト(1バイト超過)は拒否する", () => {
  expect(checkFileSize(4294967297)).toBe(false);
});

test("0 バイトは許可する(判定はサーバーに任せる)", () => {
  expect(checkFileSize(0)).toBe(true);
});
