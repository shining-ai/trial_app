import { expect, test } from "vitest";
import { formatExcess } from "../../../../src/features/merge/formatExcess";

test.each([
  [0.001, "1秒"],
  [1, "1秒"],
  [59.5, "1分"],
  [60, "1分"],
  [61, "1分1秒"],
  [120, "2分"],
  [135, "2分15秒"],
])("超過 %s 秒は「%s」(秒は切り上げ)", (seconds, expected) => {
  expect(formatExcess(seconds)).toBe(expected);
});
