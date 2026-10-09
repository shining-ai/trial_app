import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { VideoItem } from "../../../../src/features/merge/types";
import { VideoOrderList } from "../../../../src/features/merge/VideoOrderList";

afterEach(cleanup);

function video(name: string, seconds = 65): VideoItem {
  return { kind: "video", id: `id-${name}`, file_name: `${name}.mp4`, duration_seconds: seconds, width: 640, height: 360 };
}

const THREE = [video("A"), video("B"), video("C")];

function renderList(overrides: Partial<Parameters<typeof VideoOrderList>[0]> = {}) {
  const props = {
    items: THREE,
    disabled: false,
    deleteError: null,
    onMove: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  render(<VideoOrderList {...props} />);
  return props;
}

test("3件を並び順どおりに、番号付きリスト(ol)で長さと解像度つきで表示する", () => {
  renderList();

  const list = screen.getByRole("list");
  expect(list.tagName).toBe("OL");
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(3);
  expect(within(rows[0]).getByText("A.mp4")).toBeTruthy();
  expect(within(rows[1]).getByText("B.mp4")).toBeTruthy();
  expect(within(rows[2]).getByText("C.mp4")).toBeTruthy();
  expect(within(rows[0]).getByText(/1:05/)).toBeTruthy();
  expect(within(rows[0]).getByText(/640x360/)).toBeTruthy();
});

test("「B.mp4 を上へ」を押すと、位置1・上へで並びの変更を通知する", () => {
  const props = renderList();

  fireEvent.click(screen.getByRole("button", { name: "B.mp4 を上へ" }));

  expect(props.onMove).toHaveBeenCalledTimes(1);
  expect(props.onMove).toHaveBeenCalledWith(1, "up");
});

test("下へ・先頭へ・末尾へのボタンは、位置と向きを通知する", () => {
  const props = renderList();

  fireEvent.click(screen.getByRole("button", { name: "A.mp4 を下へ" }));
  fireEvent.click(screen.getByRole("button", { name: "C.mp4 を先頭へ" }));
  fireEvent.click(screen.getByRole("button", { name: "B.mp4 を末尾へ" }));

  expect(props.onMove.mock.calls).toEqual([
    [0, "down"],
    [2, "top"],
    [1, "bottom"],
  ]);
});

test("先頭の「上へ」「先頭へ」と末尾の「下へ」「末尾へ」は押せず、中間は押せる", () => {
  renderList();

  const disabled = (name: string) => (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;
  expect(disabled("A.mp4 を上へ")).toBe(true);
  expect(disabled("A.mp4 を先頭へ")).toBe(true);
  expect(disabled("A.mp4 を下へ")).toBe(false);
  expect(disabled("C.mp4 を下へ")).toBe(true);
  expect(disabled("C.mp4 を末尾へ")).toBe(true);
  expect(disabled("C.mp4 を上へ")).toBe(false);
  expect(disabled("B.mp4 を上へ")).toBe(false);
  expect(disabled("B.mp4 を下へ")).toBe(false);
});

test("「削除」を押すと、その項目のIDで通知する", () => {
  const props = renderList();

  fireEvent.click(screen.getByRole("button", { name: "B.mp4 を削除" }));

  expect(props.onRemove).toHaveBeenCalledWith("id-B");
});

test("結合中は並べ替え・削除のボタンがすべて押せない", () => {
  renderList({ disabled: true });

  const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
  expect(buttons).toHaveLength(15);
  expect(buttons.every((button) => button.disabled)).toBe(true);
});

test("削除の失敗の message をそのまま表示する", () => {
  renderList({ deleteError: "指定された動画が見つかりません" });

  expect(screen.getByRole("alert").textContent).toBe("指定された動画が見つかりません");
});

test("deleteError がなければ alert は出ない", () => {
  renderList();

  expect(screen.queryByRole("alert")).toBeNull();
});
