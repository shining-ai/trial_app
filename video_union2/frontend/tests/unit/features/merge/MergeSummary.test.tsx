import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { MergeSummary } from "../../../../src/features/merge/MergeSummary";

afterEach(cleanup);

test("合計 12:34 / 30:00 を表示し、超過がなければ超過の文言は出さない", () => {
  render(<MergeSummary totalSeconds={754} excessSeconds={0} />);

  expect(screen.getByText("合計 12:34 / 30:00")).toBeTruthy();
  expect(screen.queryByText(/超えています/)).toBeNull();
});

test("超過時は「結合後の長さが30分を2分15秒超えています」を表示する", () => {
  render(<MergeSummary totalSeconds={1935} excessSeconds={135} />);

  expect(screen.getByText("合計 32:15 / 30:00")).toBeTruthy();
  expect(screen.getByText("結合後の長さが30分を2分15秒超えています")).toBeTruthy();
});

test("1秒未満の超過は「1秒」と表示する", () => {
  render(<MergeSummary totalSeconds={1800.001} excessSeconds={0.001} />);

  expect(screen.getByText("結合後の長さが30分を1秒超えています")).toBeTruthy();
});
