import { expect, test } from "vitest";
import { sumDurationMilliseconds } from "../../../../src/features/merge/sumDurationMilliseconds";

test("各動画の長さをミリ秒の整数にしてから足す(サーバーの validate_merge_request と同じ計算)", () => {
  expect(sumDurationMilliseconds([421.507158, 429.191406, 949.301936])).toBe(1800000);
  expect(sumDurationMilliseconds([482.637353, 507.069465, 407.608742, 225.43726, 177.24768])).toBe(1800000);
  expect(sumDurationMilliseconds([900.0004, 900.0006])).toBe(1800001);
});

test("0.5ミリ秒は切り上げ、空なら0", () => {
  expect(sumDurationMilliseconds([0.0005])).toBe(1);
  expect(sumDurationMilliseconds([0.0004])).toBe(0);
  expect(sumDurationMilliseconds([])).toBe(0);
});
