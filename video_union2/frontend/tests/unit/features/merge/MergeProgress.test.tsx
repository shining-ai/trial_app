import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { MergeProgress } from "../../../../src/features/merge/MergeProgress";
import type { MergeJobResponse } from "../../../../src/features/merge/types";

afterEach(cleanup);

function job(overrides: Partial<MergeJobResponse>): MergeJobResponse {
  return { id: "job1", status: "running", progress: 0, error: null, ...overrides };
}

test("進み具合 0.475 を「48%」(四捨五入)と表示する", () => {
  render(<MergeProgress job={job({ progress: 0.475 })} />);

  expect(screen.getByText("48%")).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("value")).toBe("0.475");
});

test("進み具合 0 は「0%」と表示する", () => {
  render(<MergeProgress job={job({ progress: 0 })} />);

  expect(screen.getByText("0%")).toBeTruthy();
});

test("失敗したらサーバーの message を表示し、進み具合は出さない", () => {
  render(
    <MergeProgress
      job={job({
        status: "failed",
        progress: 0.3,
        error: { code: "merge_failed", message: "2番目の動画『b.mp4』の変換に失敗しました" },
      })}
    />,
  );

  expect(screen.getByRole("alert").textContent).toBe("2番目の動画『b.mp4』の変換に失敗しました");
  expect(screen.queryByText("30%")).toBeNull();
});

test("ジョブがないとき・完了したときは何も表示しない", () => {
  const { container, rerender } = render(<MergeProgress job={null} />);
  expect(container.textContent).toBe("");

  rerender(<MergeProgress job={job({ status: "succeeded", progress: 1 })} />);
  expect(container.textContent).toBe("");
});
