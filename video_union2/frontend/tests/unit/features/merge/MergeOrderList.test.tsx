import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { MergeOrderList } from "../../../../src/features/merge/MergeOrderList";
import type { MergeItem, TextSceneItem, VideoItem } from "../../../../src/features/merge/types";

afterEach(cleanup);

function video(name: string, seconds = 65): VideoItem {
  return { kind: "video", id: `id-${name}`, file_name: `${name}.mp4`, duration_seconds: seconds, width: 640, height: 360 };
}

const THREE = [video("A"), video("B"), video("C")];

function renderList(overrides: Partial<Parameters<typeof MergeOrderList>[0]> = {}) {
  const props = {
    items: THREE as MergeItem[],
    editor: null,
    editorError: null,
    disabled: false,
    deleteError: null,
    onMove: vi.fn(),
    onRemove: vi.fn(),
    onOpenInsert: vi.fn(),
    onOpenEdit: vi.fn(),
    onConfirmText: vi.fn(),
    onCloseEditor: vi.fn(),
    ...overrides,
  };
  render(<MergeOrderList {...props} />);
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

test("結合中は並べ替え・削除・挿入のボタンがすべて押せない", () => {
  renderList({ disabled: true });

  const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
  expect(buttons).toHaveLength(19); // 3行 x (移動4 + 削除 + 挿入) + 先頭への挿入
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

const SCENE: TextSceneItem = {
  kind: "text",
  id: "text-1",
  text: "2026年10月9日\n京都 嵐山",
  durationTenths: 30,
};
const SCENE_LABEL = "テキストの場面: 2026年10月9日";
const WITH_SCENE: MergeItem[] = [video("A"), SCENE, video("B")];

function rowsOf(): HTMLElement[] {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

function isDisabled(name: string): boolean {
  return (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;
}

test("2行以上のテキストの場面の行は「📝 1行目…(3.0秒)」で、読み上げ用のラベルは「テキストの場面: 1行目」", () => {
  renderList({ items: WITH_SCENE });

  const row = rowsOf()[1];
  expect(within(row).getByText("📝 2026年10月9日…(3.0秒)")).toBeTruthy();
  expect(within(row).getByLabelText(SCENE_LABEL)).toBeTruthy();
});

test("1行だけのテキストの場面には「…」が付かず、表示時間は小数第1位まで出る", () => {
  renderList({ items: [video("A"), { ...SCENE, text: "京都", durationTenths: 55 }] });

  expect(within(rowsOf()[1]).getByText("📝 京都(5.5秒)")).toBeTruthy();
});

test("テキストの場面の並べ替え・編集・削除のボタンは「テキストの場面: 1行目 を…」のラベルで、位置とIDを通知する", () => {
  const props = renderList({ items: WITH_SCENE });

  fireEvent.click(screen.getByRole("button", { name: `${SCENE_LABEL} を上へ` }));
  fireEvent.click(screen.getByRole("button", { name: `${SCENE_LABEL} を下へ` }));
  fireEvent.click(screen.getByRole("button", { name: `${SCENE_LABEL} を先頭へ` }));
  fireEvent.click(screen.getByRole("button", { name: `${SCENE_LABEL} を末尾へ` }));
  fireEvent.click(screen.getByRole("button", { name: `${SCENE_LABEL} を編集` }));
  fireEvent.click(screen.getByRole("button", { name: `${SCENE_LABEL} を削除` }));

  expect(props.onMove.mock.calls).toEqual([
    [1, "up"],
    [1, "down"],
    [1, "top"],
    [1, "bottom"],
  ]);
  expect(props.onOpenEdit).toHaveBeenCalledWith("text-1");
  expect(props.onRemove).toHaveBeenCalledWith("text-1");
});

test("先頭にあるテキストの場面の「上へ」「先頭へ」、末尾にあるものの「下へ」「末尾へ」は押せない", () => {
  renderList({ items: [SCENE, video("A"), { ...SCENE, id: "text-2" }] });

  const rows = rowsOf();
  const button = (row: HTMLElement, name: string) => within(row).getByRole("button", { name }) as HTMLButtonElement;
  expect(button(rows[0], `${SCENE_LABEL} を上へ`).disabled).toBe(true);
  expect(button(rows[0], `${SCENE_LABEL} を先頭へ`).disabled).toBe(true);
  expect(button(rows[0], `${SCENE_LABEL} を下へ`).disabled).toBe(false);
  expect(button(rows[2], `${SCENE_LABEL} を下へ`).disabled).toBe(true);
  expect(button(rows[2], `${SCENE_LABEL} を末尾へ`).disabled).toBe(true);
  expect(button(rows[2], `${SCENE_LABEL} を上へ`).disabled).toBe(false);
});

test("動画の行に「編集」ボタンはなく、テキストの場面の行にはある", () => {
  renderList({ items: WITH_SCENE });

  const rows = rowsOf();
  expect(within(rows[0]).queryByRole("button", { name: /編集/ })).toBeNull();
  expect(within(rows[2]).queryByRole("button", { name: /編集/ })).toBeNull();
  expect(within(rows[1]).getByRole("button", { name: /編集/ })).toBeTruthy();
});

test("「先頭にテキストを挿入」は afterId null、各行の「この後にテキストを挿入」はその行のIDで通知する", () => {
  const props = renderList({ items: WITH_SCENE });

  fireEvent.click(screen.getByRole("button", { name: "先頭にテキストを挿入" }));
  const rows = rowsOf();
  fireEvent.click(within(rows[0]).getByRole("button", { name: "この後にテキストを挿入" }));
  fireEvent.click(within(rows[1]).getByRole("button", { name: "この後にテキストを挿入" }));
  fireEvent.click(within(rows[2]).getByRole("button", { name: "この後にテキストを挿入" }));

  expect(props.onOpenInsert.mock.calls).toEqual([[null], ["id-A"], ["text-1"], ["id-B"]]);
});

test("先頭への挿入の入力欄は、一覧の上に開く", () => {
  renderList({ items: WITH_SCENE, editor: { mode: "insert", afterId: null } });

  const field = screen.getByLabelText("テキスト");
  const list = screen.getByRole("list");
  expect(list.contains(field)).toBe(false);
  expect(field.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect((screen.getByLabelText("表示時間(秒)") as HTMLInputElement).value).toBe("3.0");
});

test("行の後への挿入の入力欄は、その行のすぐ下(同じ行の中)に開く", () => {
  renderList({ items: WITH_SCENE, editor: { mode: "insert", afterId: "id-A" } });

  const rows = rowsOf();
  expect(within(rows[0]).getByLabelText("テキスト")).toBeTruthy();
  expect(within(rows[1]).queryByLabelText("テキスト")).toBeNull();
  expect(within(rows[2]).queryByLabelText("テキスト")).toBeNull();
  expect(screen.getAllByLabelText("テキスト")).toHaveLength(1);
});

test("編集の入力欄は、その行の位置に今のテキストと表示時間を入れて開く", () => {
  renderList({ items: WITH_SCENE, editor: { mode: "edit", id: "text-1" } });

  const rows = rowsOf();
  expect(rows).toHaveLength(3);
  expect((within(rows[1]).getByLabelText("テキスト") as HTMLTextAreaElement).value).toBe("2026年10月9日\n京都 嵐山");
  expect((within(rows[1]).getByLabelText("表示時間(秒)") as HTMLInputElement).value).toBe("3.0");
  expect(screen.getAllByLabelText("テキスト")).toHaveLength(1);
});

test("入力欄の確定と取り消しが、親への通知になる", () => {
  const props = renderList({ items: WITH_SCENE, editor: { mode: "insert", afterId: "id-B" } });

  fireEvent.change(screen.getByLabelText("テキスト"), { target: { value: "京都" } });
  fireEvent.click(screen.getByRole("button", { name: "確定" }));
  fireEvent.click(screen.getByRole("button", { name: "取り消し" }));

  expect(props.onConfirmText).toHaveBeenCalledWith("京都", 30);
  expect(props.onCloseEditor).toHaveBeenCalledTimes(1);
});

test("挿入位置がなくなった理由(editorError)が入力欄に表示される", () => {
  const message = "挿入する位置の項目がなくなりました。取り消して、もう一度挿入してください";
  renderList({ items: WITH_SCENE, editor: { mode: "insert", afterId: "gone" }, editorError: message });

  expect(screen.getByText(message)).toBeTruthy();
});

test.each([
  ["挿入", { mode: "insert", afterId: "id-A" } as const],
  ["編集", { mode: "edit", id: "text-1" } as const],
])(
  "入力欄(%s)が開いている間は、挿入・編集・並べ替え・削除のボタンがすべて押せず、確定と取り消しは押せる",
  (_name, editor) => {
    renderList({ items: WITH_SCENE, editor });

    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    const own = buttons.filter((button) => ["確定", "取り消し"].includes(button.textContent ?? ""));
    const others = buttons.filter((button) => !own.includes(button));
    expect(own).toHaveLength(2);
    expect(own.every((button) => !button.disabled)).toBe(true);
    expect(others.length).toBeGreaterThan(10);
    expect(others.every((button) => button.disabled)).toBe(true);
  },
);

test("入力欄が閉じていて結合中でなければ、挿入・編集・削除・端でない並べ替えのボタンは押せる", () => {
  renderList({ items: WITH_SCENE });

  expect(isDisabled("先頭にテキストを挿入")).toBe(false);
  expect(isDisabled(`${SCENE_LABEL} を編集`)).toBe(false);
  expect(isDisabled(`${SCENE_LABEL} を削除`)).toBe(false);
  expect(isDisabled(`${SCENE_LABEL} を上へ`)).toBe(false);
});

test("結合中は、テキストの場面を含む一覧の挿入・編集・削除・並べ替えのボタンがすべて押せない", () => {
  renderList({ items: WITH_SCENE, disabled: true });

  const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
  expect(buttons).toHaveLength(20); // 先頭への挿入1 + 動画2行 x 6 + テキストの場面の行 7
  expect(buttons.every((button) => button.disabled)).toBe(true);
});
