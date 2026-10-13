import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { UploadForm } from "../../../../src/features/upload/UploadForm";

afterEach(cleanup);

const LIMIT_MESSAGE = "一度に結合できるのは100本までです";

test("ファイル選択は動画を複数選べる設定で、残り枠があれば押せて、上限の案内は出ない", () => {
  render(<UploadForm remainingSlots={3} showLimitNotice={false} onSelect={() => {}} />);

  const input = screen.getByLabelText("動画ファイルを選択") as HTMLInputElement;
  expect(input.type).toBe("file");
  expect(input.accept).toBe("video/*");
  expect(input.multiple).toBe(true);
  expect(input.disabled).toBe(false);
  expect(screen.queryByText(LIMIT_MESSAGE)).toBeNull();
});

test("残り枠が0のときはファイル選択を押せず、「一度に結合できるのは100本までです」を表示する", () => {
  render(<UploadForm remainingSlots={0} showLimitNotice={false} onSelect={() => {}} />);

  expect((screen.getByLabelText("動画ファイルを選択") as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText(LIMIT_MESSAGE)).toBeTruthy();
});

test("選んだ分が切り捨てられたときは、残り枠があっても上限の案内を表示する", () => {
  render(<UploadForm remainingSlots={2} showLimitNotice={true} onSelect={() => {}} />);

  expect(screen.getByText(LIMIT_MESSAGE)).toBeTruthy();
});

test("ファイルを選ぶと、選んだ順のファイルの配列を渡す", () => {
  const onSelect = vi.fn();
  render(<UploadForm remainingSlots={5} showLimitNotice={false} onSelect={onSelect} />);
  const first = new File(["1"], "first.mp4", { type: "video/mp4" });
  const second = new File(["2"], "second.mp4", { type: "video/mp4" });

  fireEvent.change(screen.getByLabelText("動画ファイルを選択"), { target: { files: [first, second] } });

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith([first, second]);
});
