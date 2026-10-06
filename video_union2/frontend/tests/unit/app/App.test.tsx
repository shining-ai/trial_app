import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../../src/app/App";
import { fetchMergeJob } from "../../../src/features/merge/fetchMergeJob";
import { requestMerge } from "../../../src/features/merge/requestMerge";
import type { VideoResponse } from "../../../src/features/upload/types";
import { uploadVideo } from "../../../src/features/upload/uploadVideo";

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

test("1本だけのときは結合ボタンが押せず、理由が表示される", async () => {
  render(<App />);

  await selectFiles("a.mp4");

  await screen.findByText("合計 1:00 / 30:00");
  expect((screen.getByRole("button", { name: "結合する" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("結合するには2本以上の動画が必要です")).toBeTruthy();
});

test("画面で並べ替えた順の video_ids で結合を始め、進み具合を表示し、完了したらダウンロードリンクを表示する", async () => {
  vi.mocked(requestMerge).mockResolvedValue({ id: "job1", status: "running", progress: 0.25, error: null });
  vi.mocked(fetchMergeJob).mockResolvedValue({ id: "job1", status: "succeeded", progress: 1, error: null });
  render(<App />);
  await selectFiles("a.mp4", "b.mp4", "c.mp4");
  await screen.findByText("合計 3:00 / 30:00");

  fireEvent.click(screen.getByRole("button", { name: "c.mp4 を先頭へ" }));
  fireEvent.click(screen.getByRole("button", { name: "結合する" }));

  await waitFor(() => expect(requestMerge).toHaveBeenCalledTimes(1));
  const videoIds = vi.mocked(requestMerge).mock.calls[0][0];
  expect(videoIds).toHaveLength(3);
  expect(videoIds[0]).toBe("id-c.mp4");
  expect(videoIds).toEqual(["id-c.mp4", expect.stringMatching(/^id-[ab]\.mp4$/), expect.stringMatching(/^id-[ab]\.mp4$/)]);
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
