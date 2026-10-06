import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { UploadList } from "../../../../src/features/upload/UploadList";
import type { UploadItem } from "../../../../src/features/upload/types";

afterEach(cleanup);

function item(overrides: Partial<UploadItem> & Pick<UploadItem, "status">): UploadItem {
  return { key: "k1", file: new File(["x"], "a.mp4"), progress: 0, ...overrides };
}

test("送信中は進み具合を四捨五入した%で表示する", () => {
  render(<UploadList items={[item({ status: "uploading", progress: 0.475 })]} />);

  const row = screen.getByRole("listitem");
  expect(within(row).getByText("a.mp4")).toBeTruthy();
  expect(within(row).getByText("48%")).toBeTruthy();
});

test("待機中は「待機中」と表示する", () => {
  render(<UploadList items={[item({ status: "pending" })]} />);

  expect(screen.getByText("待機中")).toBeTruthy();
});

test("失敗はサーバーの message をそのまま表示する", () => {
  render(
    <UploadList
      items={[item({ status: "failed", errorMessage: "解像度 7680x4320 は上限 3840x2160 を超えています" })]}
    />,
  );

  expect(screen.getByText("解像度 7680x4320 は上限 3840x2160 を超えています")).toBeTruthy();
});

test("完了は長さと解像度を表示する", () => {
  render(
    <UploadList
      items={[
        item({
          status: "done",
          video: { id: "a".repeat(32), file_name: "a.mp4", duration_seconds: 125.4, width: 640, height: 360 },
        }),
      ]}
    />,
  );

  const row = screen.getByRole("listitem");
  expect(within(row).getByText(/2:05/)).toBeTruthy();
  expect(within(row).getByText(/640x360/)).toBeTruthy();
});

test("複数の項目を渡された順に1行ずつ表示する", () => {
  render(
    <UploadList
      items={[
        item({ key: "k1", status: "pending", file: new File(["x"], "first.mp4") }),
        item({ key: "k2", status: "pending", file: new File(["x"], "second.mp4") }),
      ]}
    />,
  );

  const rows = screen.getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText("first.mp4")).toBeTruthy();
  expect(within(rows[1]).getByText("second.mp4")).toBeTruthy();
});
