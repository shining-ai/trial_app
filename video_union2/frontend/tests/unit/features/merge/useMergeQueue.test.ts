import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deleteVideo } from "../../../../src/features/merge/deleteVideo";
import type { MergeItem } from "../../../../src/features/merge/types";
import { useMergeQueue } from "../../../../src/features/merge/useMergeQueue";
import { ApiError } from "../../../../src/lib/apiClient";

// 削除の成功・失敗をテストから制御するため、deleteVideo だけを差し替える
vi.mock("../../../../src/features/merge/deleteVideo", () => ({ deleteVideo: vi.fn() }));

function video(id: string, seconds: number): MergeItem {
  return { id, file_name: `${id}.mp4`, duration_seconds: seconds, width: 640, height: 360 };
}

beforeEach(() => {
  vi.mocked(deleteVideo).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.mocked(deleteVideo).mockReset();
});

test("追加した順に並び、videoIds と totalSeconds に反映される", () => {
  const { result } = renderHook(() => useMergeQueue());

  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 20.5));
  });

  expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]);
  expect(result.current.videoIds).toEqual(["a", "b"]);
  expect(result.current.totalSeconds).toBe(30.5);
});

test("「削除」で deleteVideo がその項目のIDで呼ばれ、成功したら一覧から外れる", async () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 20));
  });

  let message: string | null = "unset";
  await act(async () => {
    message = await result.current.removeItem("a");
  });

  expect(deleteVideo).toHaveBeenCalledTimes(1);
  expect(deleteVideo).toHaveBeenCalledWith("a");
  expect(message).toBeNull();
  expect(result.current.videoIds).toEqual(["b"]);
  expect(result.current.deleteError).toBeNull();
});

test("deleteVideo が失敗したら一覧に残り、サーバーの message を返し、deleteError に持つ", async () => {
  vi.mocked(deleteVideo).mockRejectedValue(new ApiError(404, "video_not_found", "指定された動画が見つかりません"));
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
  });

  let message: string | null = null;
  await act(async () => {
    message = await result.current.removeItem("a");
  });

  expect(message).toBe("指定された動画が見つかりません");
  expect(result.current.deleteError).toBe("指定された動画が見つかりません");
  expect(result.current.videoIds).toEqual(["a"]);
});

test("ApiError でない失敗は固定の文言を返し、一覧に残す", async () => {
  vi.mocked(deleteVideo).mockRejectedValue(new Error("boom"));
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
  });

  let message: string | null = null;
  await act(async () => {
    message = await result.current.removeItem("a");
  });

  expect(message).toBe("削除に失敗しました");
  expect(result.current.videoIds).toEqual(["a"]);
});

test("削除が成功すると、前回の deleteError は消える", async () => {
  vi.mocked(deleteVideo).mockRejectedValueOnce(new ApiError(404, "video_not_found", "指定された動画が見つかりません"));
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 10));
  });
  await act(async () => {
    await result.current.removeItem("a");
  });
  expect(result.current.deleteError).not.toBeNull();

  await act(async () => {
    await result.current.removeItem("b");
  });

  expect(result.current.deleteError).toBeNull();
});

test("並べ替えたあとの並び順が、結合を始めるときに渡すIDの並びになる", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 10));
    result.current.addItem(video("c", 10));
  });

  act(() => {
    result.current.move(2, "top");
  });
  expect(result.current.videoIds).toEqual(["c", "a", "b"]);

  act(() => {
    result.current.move(1, "down");
  });
  expect(result.current.videoIds).toEqual(["c", "b", "a"]);
});

test("合計1810秒(超過)の状態から20秒の項目を削除すると、合計1790秒になる。追加しても合計が更新される", async () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 900));
    result.current.addItem(video("b", 890));
    result.current.addItem(video("c", 20));
  });
  expect(result.current.totalSeconds).toBe(1810);

  await act(async () => {
    await result.current.removeItem("c");
  });
  expect(result.current.totalSeconds).toBe(1790);

  act(() => {
    result.current.addItem(video("d", 15));
  });
  expect(result.current.totalSeconds).toBe(1805);
});
