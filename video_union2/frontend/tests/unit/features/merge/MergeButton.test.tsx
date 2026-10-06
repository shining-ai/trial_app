import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { MergeCheck } from "../../../../src/features/merge/checkMergeable";
import { MergeButton } from "../../../../src/features/merge/MergeButton";

afterEach(cleanup);

const OK: MergeCheck = { mergeable: true, reason: null, message: null, excessSeconds: 0 };
const TOO_FEW: MergeCheck = {
  mergeable: false,
  reason: "too_few",
  message: "結合するには2本以上の動画が必要です",
  excessSeconds: 0,
};

function button(): HTMLButtonElement {
  return screen.getByRole("button", { name: "結合する" }) as HTMLButtonElement;
}

test("結合できるときはボタンが押せ、押すと結合を始める通知が出る", () => {
  const onMerge = vi.fn();
  render(<MergeButton check={OK} rejectMessage={null} onMerge={onMerge} />);

  expect(button().disabled).toBe(false);
  fireEvent.click(button());

  expect(onMerge).toHaveBeenCalledTimes(1);
});

test("結合できないときはボタンが押せず、理由が表示される", () => {
  const onMerge = vi.fn();
  render(<MergeButton check={TOO_FEW} rejectMessage={null} onMerge={onMerge} />);

  expect(button().disabled).toBe(true);
  expect(screen.getByText("結合するには2本以上の動画が必要です")).toBeTruthy();
  fireEvent.click(button());
  expect(onMerge).not.toHaveBeenCalled();
});

test.each([
  "結合後の長さが30分を2分15秒超えています",
  "別の結合が実行中です",
  "保存先の空き容量が足りません",
])("結合リクエストが断られたら、サーバーの message「%s」がボタンの横に表示される", (message) => {
  render(<MergeButton check={OK} rejectMessage={message} onMerge={() => {}} />);

  expect(screen.getByText(message)).toBeTruthy();
  expect(button().disabled).toBe(false);
});

test("結合できるときで断られていなければ、メッセージは出ない", () => {
  render(<MergeButton check={OK} rejectMessage={null} onMerge={() => {}} />);

  expect(screen.queryByRole("status")).toBeNull();
});

test("押せない理由と断られたメッセージが重なるときは、押せない理由だけを表示する", () => {
  render(<MergeButton check={TOO_FEW} rejectMessage="別の結合が実行中です" onMerge={() => {}} />);

  expect(screen.getByText("結合するには2本以上の動画が必要です")).toBeTruthy();
  expect(screen.queryByText("別の結合が実行中です")).toBeNull();
});
