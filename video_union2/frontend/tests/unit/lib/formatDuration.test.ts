import { expect, test } from "vitest";
import { formatDuration } from "../../../src/lib/formatDuration";

test.each([
  [0, "0:00"],
  [59.9, "0:59"],
  [60, "1:00"],
  [754, "12:34"],
  [1800, "30:00"],
  [3599, "59:59"],
  [3600, "1:00:00"],
  [3661, "1:01:01"],
])("%s 秒は %s と表示する(端数は切り捨て)", (seconds, expected) => {
  expect(formatDuration(seconds)).toBe(expected);
});
