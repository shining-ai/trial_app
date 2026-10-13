import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../../src/app/App";
import { fetchMergeJob } from "../../../src/features/merge/fetchMergeJob";
import { requestMerge } from "../../../src/features/merge/requestMerge";
import type { VideoResponse } from "../../../src/features/upload/types";
import { uploadVideo } from "../../../src/features/upload/uploadVideo";
import { ApiError } from "../../../src/lib/apiClient";

// プロセス外の通信だけを差し替え、画面どうしのつなぎ込みを確かめる
vi.mock("../../../src/features/upload/uploadVideo", () => ({ uploadVideo: vi.fn() }));
vi.mock("../../../src/features/merge/requestMerge", () => ({ requestMerge: vi.fn() }));
vi.mock("../../../src/features/merge/fetchMergeJob", () => ({ fetchMergeJob: vi.fn() }));

beforeEach(() => {
  vi.mocked(uploadVideo).mockImplementation(async (file) => videoFor(file.name));
});

afterEach(() => {
  cleanup();
  vi.mocked(uploadVideo).mockReset();
  vi.mocked(requestMerge).mockReset();
  vi.mocked(fetchMergeJob).mockReset();
});

function videoFor(name: string, seconds = 60): VideoResponse {
  return { id: `id-${name}`, file_name: name, duration_seconds: seconds, width: 640, height: 360 };
}

async function selectFiles(...names: string[]) {
  const files = names.map((name) => new File(["x"], name, { type: "video/mp4" }));
  await act(async () => {
    fireEvent.change(screen.getByLabelText("動画ファイルを選択"), { target: { files } });
  });
}

test("画面の見出しにアプリ名「動画結合アプリ」が表示される", () => {
  render(<App />);

  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("動画結合アプリ");
});

test("アップロードが完了した動画は、完了順に結合リストへ入り、合計の長さが表示される", async () => {
  render(<App />);

  await selectFiles("a.mp4", "b.mp4");

  await screen.findByText("合計 2:00 / 30:00");
  const orderList = screen.getByRole("list", { name: "結合リスト" });
  expect(orderList.querySelectorAll("li")).toHaveLength(2);
  expect(within(orderList).getByText("a.mp4")).toBeTruthy();
  expect(within(orderList).getByText("b.mp4")).toBeTruthy();
});

test("動画1本だけのときは結合ボタンが押せず、理由が表示される", async () => {
  render(<App />);

  await selectFiles("a.mp4");

  await screen.findByText("合計 1:00 / 30:00");
  expect((screen.getByRole("button", { name: "結合する" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("結合するには動画とテキストの場面を合わせて2つ以上必要です")).toBeTruthy();
});

test("画面で並べ替えた順の items で結合を始め、進み具合を表示し、完了したらダウンロードリンクを表示する", async () => {
  vi.mocked(requestMerge).mockResolvedValue({ id: "job1", status: "running", progress: 0.25, error: null });
  vi.mocked(fetchMergeJob).mockResolvedValue({ id: "job1", status: "succeeded", progress: 1, error: null });
  render(<App />);
  await selectFiles("a.mp4", "b.mp4", "c.mp4");
  await screen.findByText("合計 3:00 / 30:00");

  fireEvent.click(screen.getByRole("button", { name: "c.mp4 を先頭へ" }));
  fireEvent.click(screen.getByRole("button", { name: "結合する" }));

  await waitFor(() => expect(requestMerge).toHaveBeenCalledTimes(1));
  const items = vi.mocked(requestMerge).mock.calls[0][0];
  expect(items).toHaveLength(3);
  expect(items.every((item) => item.kind === "video")).toBe(true);
  expect(items[0].id).toBe("id-c.mp4");
  expect(items.map((item) => item.id)).toEqual(["id-c.mp4", expect.stringMatching(/^id-[ab]\.mp4$/), expect.stringMatching(/^id-[ab]\.mp4$/)]);
  expect(await screen.findByText("25%")).toBeTruthy();

  const link = await screen.findByRole("link", { name: "ダウンロード" }, { timeout: 3000 });
  expect(link.getAttribute("href")).toBe("/api/merges/job1/download");
});

test("結合リストの「削除」で deleteVideo 経由の DELETE が呼ばれ、一覧から消える", async () => {
  const fetchStub = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchStub);
  render(<App />);
  await selectFiles("a.mp4", "b.mp4");
  await screen.findByText("合計 2:00 / 30:00");

  fireEvent.click(screen.getByRole("button", { name: "a.mp4 を削除" }));

  await screen.findByText("合計 1:00 / 30:00");
  expect(fetchStub).toHaveBeenCalledWith("/api/videos/id-a.mp4", { method: "DELETE" });
  vi.unstubAllGlobals();
});

async function insertTextAtTop(text: string, duration?: string) {
  fireEvent.click(screen.getByRole("button", { name: "先頭にテキストを挿入" }));
  fireEvent.change(screen.getByLabelText("テキスト"), { target: { value: text } });
  if (duration !== undefined) fireEvent.change(screen.getByLabelText("表示時間(秒)"), { target: { value: duration } });
  fireEvent.click(screen.getByRole("button", { name: "確定" }));
}

test("テキストの場面を挿入しても、アップロードの残りの枠が減らない(mergeCount は動画の本数)", async () => {
  render(<App />);
  const names = Array.from({ length: 99 }, (_, i) => `v${i}.mp4`);
  await selectFiles(...names);
  await waitFor(() => expect(screen.getByRole("list", { name: "結合リスト" }).querySelectorAll("li")).toHaveLength(99), {
    timeout: 5000,
  });
  const fileInput = () => screen.getByLabelText("動画ファイルを選択") as HTMLInputElement;
  expect(fileInput().disabled).toBe(false);

  await insertTextAtTop("見出し");

  expect(screen.getByRole("list", { name: "結合リスト" }).querySelectorAll("li")).toHaveLength(100);
  expect(fileInput().disabled).toBe(false);
  expect(screen.queryByText("一度に結合できるのは100本までです")).toBeNull();

  await selectFiles("last.mp4");
  await waitFor(() => expect(screen.getByRole("list", { name: "結合リスト" }).querySelectorAll("li")).toHaveLength(101), {
    timeout: 5000,
  });
  expect(fileInput().disabled).toBe(true);
});

test("テキストの場面の表示時間も合計の長さに含まれる", async () => {
  render(<App />);
  await selectFiles("a.mp4");
  await screen.findByText("合計 1:00 / 30:00");

  await insertTextAtTop("見出し", "5.5");

  await screen.findByText("合計 1:05 / 30:00");
});

test("動画1本とテキストの場面1つで結合でき、画面の並びのまま items(テキストは正規化済みの本文)で結合を始める", async () => {
  vi.mocked(requestMerge).mockResolvedValue({ id: "job1", status: "running", progress: 0, error: null });
  vi.mocked(fetchMergeJob).mockResolvedValue({ id: "job1", status: "running", progress: 0.5, error: null });
  render(<App />);
  await selectFiles("a.mp4");
  await screen.findByText("合計 1:00 / 30:00");

  await insertTextAtTop("　京都\n嵐山\n", "2");

  const mergeButton = screen.getByRole("button", { name: "結合する" }) as HTMLButtonElement;
  expect(mergeButton.disabled).toBe(false);
  fireEvent.click(mergeButton);

  await waitFor(() => expect(requestMerge).toHaveBeenCalledTimes(1));
  expect(vi.mocked(requestMerge).mock.calls[0][0]).toEqual([
    { kind: "text", id: "text-1", text: "京都\n嵐山", durationTenths: 20 },
    {
      kind: "video",
      id: "id-a.mp4",
      file_name: "a.mp4",
      duration_seconds: 60,
      width: 640,
      height: 360,
    },
  ]);
});

test("テキストの場面だけ(動画0本)のときは結合ボタンが押せず「結合するには動画が1本以上必要です」と表示される", async () => {
  render(<App />);

  await insertTextAtTop("見出し");

  expect((screen.getByRole("button", { name: "結合する" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("結合するには動画が1本以上必要です")).toBeTruthy();
});

test("入力欄が開いている間は結合ボタンが押せず、「テキストの入力を確定するか取り消してください」と表示され、取り消すと戻る", async () => {
  render(<App />);
  await selectFiles("a.mp4", "b.mp4");
  await screen.findByText("合計 2:00 / 30:00");

  fireEvent.click(screen.getByRole("button", { name: "先頭にテキストを挿入" }));

  expect((screen.getByRole("button", { name: "結合する" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("テキストの入力を確定するか取り消してください")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "取り消し" }));

  expect((screen.getByRole("button", { name: "結合する" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByText("テキストの入力を確定するか取り消してください")).toBeNull();
});

test("21文字の行は確定できず、理由が入力欄に表示されて一覧に入らない", async () => {
  render(<App />);
  await selectFiles("a.mp4");
  await screen.findByText("合計 1:00 / 30:00");

  await insertTextAtTop("あ".repeat(21));

  expect(screen.getByText("1行は20文字までです(1行目が21文字)")).toBeTruthy();
  expect(screen.getByRole("list", { name: "結合リスト" }).querySelectorAll("li")).toHaveLength(1);
});

test("テキストの場面の「削除」は DELETE を呼ばず、一覧から外すだけ", async () => {
  const fetchStub = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchStub);
  render(<App />);
  await selectFiles("a.mp4");
  await screen.findByText("合計 1:00 / 30:00");
  await insertTextAtTop("見出し");

  fireEvent.click(screen.getByRole("button", { name: "テキストの場面: 見出し を削除" }));

  await screen.findByText("合計 1:00 / 30:00");
  expect(screen.getByRole("list", { name: "結合リスト" }).querySelectorAll("li")).toHaveLength(1);
  expect(fetchStub).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test("サーバーが 422 unsupported_characters を返したら、message が結合ボタンの横に表示される", async () => {
  const message = "2番目のテキストの場面: 表示できない文字が含まれています: 한";
  vi.mocked(requestMerge).mockRejectedValue(new ApiError(422, "unsupported_characters", message));
  render(<App />);
  await selectFiles("a.mp4");
  await screen.findByText("合計 1:00 / 30:00");
  await insertTextAtTop("한");

  fireEvent.click(screen.getByRole("button", { name: "結合する" }));

  expect(await screen.findByText(message)).toBeTruthy();
});
