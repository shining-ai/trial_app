import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { DownloadLink } from "../../../../src/features/download/DownloadLink";

afterEach(cleanup);

test("ジョブIDから /api/merges/{job_id}/download へのリンクを表示する", () => {
  render(<DownloadLink jobId="job123" />);

  const link = screen.getByRole("link", { name: "ダウンロード" });
  expect(link.getAttribute("href")).toBe("/api/merges/job123/download");
});
