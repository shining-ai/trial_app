import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TextSceneEditor } from "../../../../src/features/merge/TextSceneEditor";

afterEach(cleanup);

const DURATION_MESSAGE = "表示時間は1秒から60秒までで、小数第1位まで指定してください";

function renderEditor(overrides: Partial<Parameters<typeof TextSceneEditor>[0]> = {}) {
  const props = {
    initialText: "",
    initialDuration: "3.0",
    error: null,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<TextSceneEditor {...props} />);
  return props;
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText("テキスト") as HTMLTextAreaElement;
}

function duration(): HTMLInputElement {
  return screen.getByLabelText("表示時間(秒)") as HTMLInputElement;
}

function type(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

test("テキストは複数行の入力欄、表示時間は小数向けの文字入力欄で、新規の初期値は「3.0」", () => {
  renderEditor();

  expect(textarea().tagName).toBe("TEXTAREA");
  expect(textarea().value).toBe("");
  expect(duration().tagName).toBe("INPUT");
  expect(duration().type).toBe("text");
  expect(duration().inputMode).toBe("decimal");
  expect(duration().value).toBe("3.0");
});

test("編集では、渡された今のテキストと表示時間が入っている", () => {
  renderEditor({ initialText: "京都\n嵐山", initialDuration: "5.5" });

  expect(textarea().value).toBe("京都\n嵐山");
  expect(duration().value).toBe("5.5");
});

test("入力に応じて「2/5行、4/100文字」が更新される", () => {
  renderEditor();
  expect(screen.getByText("0/5行、0/100文字")).toBeTruthy();

  type(textarea(), "京都");
  expect(screen.getByText("1/5行、2/100文字")).toBeTruthy();

  type(textarea(), "京都\n嵐山");
  expect(screen.getByText("2/5行、4/100文字")).toBeTruthy();
});

test("21文字の行で「確定」を押すと理由が表示され、onConfirm が呼ばれない", () => {
  const props = renderEditor();
  type(textarea(), "あ".repeat(21));

  fireEvent.click(screen.getByRole("button", { name: "確定" }));

  expect(screen.getByText("1行は20文字までです(1行目が21文字)")).toBeTruthy();
  expect(props.onConfirm).not.toHaveBeenCalled();
});

test("空のテキストで「確定」を押すと「テキストを入力してください」が表示される", () => {
  const props = renderEditor();

  fireEvent.click(screen.getByRole("button", { name: "確定" }));

  expect(screen.getByText("テキストを入力してください")).toBeTruthy();
  expect(props.onConfirm).not.toHaveBeenCalled();
});

test("絵文字を含むテキストで「確定」を押すと、原因の文字つきの理由が表示される", () => {
  const props = renderEditor();
  type(textarea(), "京都😀");

  fireEvent.click(screen.getByRole("button", { name: "確定" }));

  expect(screen.getByText("表示できない文字が含まれています: 😀")).toBeTruthy();
  expect(props.onConfirm).not.toHaveBeenCalled();
});

test("表示時間「0.9」で「確定」を押すと表示時間の理由が表示され、onConfirm が呼ばれない", () => {
  const props = renderEditor({ initialText: "京都" });
  type(duration(), "0.9");

  fireEvent.click(screen.getByRole("button", { name: "確定" }));

  expect(screen.getByText(DURATION_MESSAGE)).toBeTruthy();
  expect(props.onConfirm).not.toHaveBeenCalled();
});

test("テキストと表示時間の両方がだめなときは、両方の理由が表示される", () => {
  const props = renderEditor();
  type(textarea(), "あ".repeat(21));
  type(duration(), "abc");

  fireEvent.click(screen.getByRole("button", { name: "確定" }));

  expect(screen.getByText("1行は20文字までです(1行目が21文字)")).toBeTruthy();
  expect(screen.getByText(DURATION_MESSAGE)).toBeTruthy();
  expect(props.onConfirm).not.toHaveBeenCalled();
});

test("正しい入力で「確定」を押すと、正規化済みのテキストと0.1秒単位の整数で onConfirm が呼ばれ、理由は出ない", () => {
  const props = renderEditor();
  type(textarea(), "　京都\r\n嵐山 \n");
  type(duration(), "5.5");

  fireEvent.click(screen.getByRole("button", { name: "確定" }));

  expect(props.onConfirm).toHaveBeenCalledTimes(1);
  expect(props.onConfirm).toHaveBeenCalledWith("京都\n嵐山", 55);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("表示時間を直さずに確定すると、初期値の「3.0」が30として渡る", () => {
  const props = renderEditor();
  type(textarea(), "京都");

  fireEvent.click(screen.getByRole("button", { name: "確定" }));

  expect(props.onConfirm).toHaveBeenCalledWith("京都", 30);
});

test("理由が出たあとに直して「確定」を押すと、前の理由は消えて onConfirm が呼ばれる", () => {
  const props = renderEditor();
  type(textarea(), "あ".repeat(21));
  fireEvent.click(screen.getByRole("button", { name: "確定" }));
  expect(screen.getByText("1行は20文字までです(1行目が21文字)")).toBeTruthy();

  type(textarea(), "あ".repeat(20));
  fireEvent.click(screen.getByRole("button", { name: "確定" }));

  expect(screen.queryByText("1行は20文字までです(1行目が21文字)")).toBeNull();
  expect(props.onConfirm).toHaveBeenCalledWith("あ".repeat(20), 30);
});

test("「取り消し」で onCancel が呼ばれ、onConfirm は呼ばれない", () => {
  const props = renderEditor({ initialText: "京都" });

  fireEvent.click(screen.getByRole("button", { name: "取り消し" }));

  expect(props.onCancel).toHaveBeenCalledTimes(1);
  expect(props.onConfirm).not.toHaveBeenCalled();
});

test("外から渡された理由(挿入位置がなくなったなど)も、入力欄に表示される", () => {
  renderEditor({ error: "挿入する位置の項目がなくなりました。取り消して、もう一度挿入してください" });

  expect(screen.getByText("挿入する位置の項目がなくなりました。取り消して、もう一度挿入してください")).toBeTruthy();
});
