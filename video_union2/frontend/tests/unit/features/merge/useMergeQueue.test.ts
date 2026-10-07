import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deleteVideo } from "../../../../src/features/merge/deleteVideo";
import type { MergeItem } from "../../../../src/features/merge/types";
import { checkMergeable } from "../../../../src/features/merge/checkMergeable";
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

test("deleteVideo が404(video_not_found)なら、サーバーにはもうないので、成功と同じく一覧から外す", async () => {
  vi.mocked(deleteVideo).mockRejectedValue(new ApiError(404, "video_not_found", "指定された動画が見つかりません"));
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 20));
  });

  let message: string | null = "unset";
  await act(async () => {
    message = await result.current.removeItem("a");
  });

  expect(message).toBeNull();
  expect(result.current.videoIds).toEqual(["b"]);
  expect(result.current.deleteError).toBeNull();
});

test("deleteVideo が404以外のApiErrorで失敗したら一覧に残り、サーバーの message を返し、deleteError に持つ", async () => {
  vi.mocked(deleteVideo).mockRejectedValue(new ApiError(409, "merge_in_progress", "結合中の動画は削除できません"));
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
  });

  let message: string | null = null;
  await act(async () => {
    message = await result.current.removeItem("a");
  });

  expect(message).toBe("結合中の動画は削除できません");
  expect(result.current.deleteError).toBe("結合中の動画は削除できません");
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
  vi.mocked(deleteVideo).mockRejectedValueOnce(new ApiError(500, "unknown", "サーバーとの通信に失敗しました"));
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

function mergeable(totalSeconds: number, count: number) {
  return checkMergeable({ count, totalSeconds, isMerging: false }).mergeable;
}

test("合計1810秒(超過)の状態から20秒の項目を削除すると、合計1790秒になる。追加しても合計が更新される", async () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 900));
    result.current.addItem(video("b", 890));
    result.current.addItem(video("c", 20));
  });
  expect(result.current.totalSeconds).toBe(1810);
  expect(mergeable(result.current.totalSeconds, 3)).toBe(false);

  await act(async () => {
    await result.current.removeItem("c");
  });
  expect(result.current.totalSeconds).toBe(1790);
  expect(mergeable(result.current.totalSeconds, 2)).toBe(true);

  act(() => {
    result.current.addItem(video("d", 15));
  });
  expect(result.current.totalSeconds).toBe(1805);
  expect(mergeable(result.current.totalSeconds, 3)).toBe(false);
});

test("合計が 1800.0005 秒付近でも、サーバーと同じくミリ秒の整数で足して判定する", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    [421.507158, 429.191406, 949.301936].forEach((seconds, i) => result.current.addItem(video(`v${i}`, seconds)));
  });

  expect(result.current.totalSeconds).toBe(1800);
  expect(mergeable(result.current.totalSeconds, 3)).toBe(true);
});

test("「削除」を押した時点で一覧から外れ(結合に含まれない)、404以外で失敗したら元の位置に戻る", async () => {
  let rejectDelete: (error: unknown) => void = () => {};
  vi.mocked(deleteVideo).mockImplementation(
    () => new Promise((_resolve, reject) => { rejectDelete = reject; }),
  );
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 20));
    result.current.addItem(video("c", 30));
  });

  let pending: Promise<string | null> = Promise.resolve(null);
  act(() => {
    pending = result.current.removeItem("b");
  });
  expect(result.current.videoIds).toEqual(["a", "c"]);
  expect(result.current.totalSeconds).toBe(40);

  await act(async () => {
    rejectDelete(new ApiError(500, "internal", "削除できませんでした"));
    await pending;
  });
  expect(result.current.videoIds).toEqual(["a", "b", "c"]);
  expect(result.current.deleteError).toBe("削除できませんでした");
});
