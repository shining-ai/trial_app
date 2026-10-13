import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchMergeJob } from "../../../../src/features/merge/fetchMergeJob";
import { requestMerge } from "../../../../src/features/merge/requestMerge";
import type { MergeItem, MergeJobResponse } from "../../../../src/features/merge/types";
import { useMergeJob } from "../../../../src/features/merge/useMergeJob";
import { ApiError } from "../../../../src/lib/apiClient";

// API の応答の移り変わりを順に返すため、requestMerge と fetchMergeJob だけを差し替える
vi.mock("../../../../src/features/merge/requestMerge", () => ({ requestMerge: vi.fn() }));
vi.mock("../../../../src/features/merge/fetchMergeJob", () => ({ fetchMergeJob: vi.fn() }));

function video(id: string): MergeItem {
  return { kind: "video", id, file_name: `${id}.mp4`, duration_seconds: 1, width: 320, height: 180 };
}

function job(status: MergeJobResponse["status"], progress: number, message?: string): MergeJobResponse {
  return {
    id: "job1",
    status,
    progress,
    error: message ? { code: "merge_failed", message } : null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.mocked(requestMerge).mockReset();
  vi.mocked(fetchMergeJob).mockReset();
});

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe("useMergeJob", () => {
  test("requestMerge に、渡した MergeItem[] がそのまま(変換せず、同じ並び順で)渡される", async () => {
    const items: MergeItem[] = [
      video("c"),
      { kind: "text", id: "text-1", text: "京都", durationTenths: 30 },
      video("a"),
      video("b"),
    ];
    vi.mocked(requestMerge).mockResolvedValue(job("running", 0));
    const { result } = renderHook(() => useMergeJob());

    await act(async () => {
      await result.current.start(items);
    });

    expect(requestMerge).toHaveBeenCalledTimes(1);
    expect(requestMerge).toHaveBeenCalledWith(items);
    expect(result.current.job).toEqual(job("running", 0));
    expect(result.current.isMerging).toBe(true);
  });

  test("running の間は1秒ごとに問い合わせを続け、succeeded で止まる", async () => {
    vi.mocked(requestMerge).mockResolvedValue(job("running", 0));
    vi.mocked(fetchMergeJob)
      .mockResolvedValueOnce(job("running", 0.5))
      .mockResolvedValueOnce(job("succeeded", 1));
    const { result } = renderHook(() => useMergeJob());
    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });
    expect(fetchMergeJob).not.toHaveBeenCalled();

    await advance(999);
    expect(fetchMergeJob).not.toHaveBeenCalled();

    await advance(1);
    expect(fetchMergeJob).toHaveBeenCalledTimes(1);
    expect(fetchMergeJob).toHaveBeenLastCalledWith("job1");
    expect(result.current.job).toEqual(job("running", 0.5));
    expect(result.current.isMerging).toBe(true);

    await advance(1000);
    expect(fetchMergeJob).toHaveBeenCalledTimes(2);
    expect(result.current.job).toEqual(job("succeeded", 1));
    expect(result.current.isMerging).toBe(false);

    await advance(10000);
    expect(fetchMergeJob).toHaveBeenCalledTimes(2);
  });

  test("failed ならサーバーの message を持つジョブを返して止まる", async () => {
    vi.mocked(requestMerge).mockResolvedValue(job("running", 0));
    vi.mocked(fetchMergeJob).mockResolvedValueOnce(job("failed", 0.3, "2番目の動画『b.mp4』の変換に失敗しました"));
    const { result } = renderHook(() => useMergeJob());
    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });

    await advance(1000);
    await advance(10000);

    expect(fetchMergeJob).toHaveBeenCalledTimes(1);
    expect(result.current.job?.status).toBe("failed");
    expect(result.current.job?.error?.message).toBe("2番目の動画『b.mp4』の変換に失敗しました");
    expect(result.current.isMerging).toBe(false);
  });

  test.each([
    [422, "too_long", "結合後の長さが30分を2分15秒超えています"],
    [409, "merge_in_progress", "別の結合が実行中です"],
    [507, "insufficient_storage", "保存先の空き容量が足りません"],
  ])("%s の応答で、サーバーの message を返し、結合中にならない", async (status, code, message) => {
    vi.mocked(requestMerge).mockRejectedValue(new ApiError(status, code, message));
    const { result } = renderHook(() => useMergeJob());

    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });
    await advance(5000);

    expect(result.current.rejectMessage).toBe(message);
    expect(result.current.job).toBeNull();
    expect(result.current.isMerging).toBe(false);
    expect(fetchMergeJob).not.toHaveBeenCalled();
  });

  test("ApiError でない失敗は、固定の文言を返す", async () => {
    vi.mocked(requestMerge).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useMergeJob());

    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });

    expect(result.current.rejectMessage).toBe("結合を始められませんでした");
  });

  test("問い合わせが404(ジョブがない)なら、サーバーの message で失敗にして止まる", async () => {
    vi.mocked(requestMerge).mockResolvedValue(job("running", 0));
    vi.mocked(fetchMergeJob).mockRejectedValue(new ApiError(404, "job_not_found", "結合が見つかりません"));
    const { result } = renderHook(() => useMergeJob());
    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });

    await advance(1000);
    await advance(10000);

    expect(fetchMergeJob).toHaveBeenCalledTimes(1);
    expect(result.current.job?.status).toBe("failed");
    expect(result.current.job?.error?.message).toBe("結合が見つかりません");
    expect(result.current.isMerging).toBe(false);
  });

  test("問い合わせが5xxで失敗しても、ジョブは failed にならず、1秒後に問い合わせを続ける", async () => {
    vi.mocked(requestMerge).mockResolvedValue(job("running", 0));
    vi.mocked(fetchMergeJob)
      .mockRejectedValueOnce(new ApiError(503, "unknown", "サーバーとの通信に失敗しました"))
      .mockResolvedValueOnce(job("succeeded", 1));
    const { result } = renderHook(() => useMergeJob());
    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });

    await advance(1000);
    expect(fetchMergeJob).toHaveBeenCalledTimes(1);
    expect(result.current.job).toEqual(job("running", 0));
    expect(result.current.isMerging).toBe(true);

    await advance(999);
    expect(fetchMergeJob).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMergeJob).toHaveBeenCalledTimes(2);
    expect(result.current.job).toEqual(job("succeeded", 1));
    expect(result.current.isMerging).toBe(false);
  });

  test("通信の失敗(例外)でも、ジョブは failed にならず、1秒後に問い合わせを続ける", async () => {
    vi.mocked(requestMerge).mockResolvedValue(job("running", 0));
    vi.mocked(fetchMergeJob)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(job("running", 0.7));
    const { result } = renderHook(() => useMergeJob());
    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });

    await advance(1000);
    await advance(1000);
    expect(fetchMergeJob).toHaveBeenCalledTimes(2);
    expect(result.current.job).toEqual(job("running", 0));
    expect(result.current.isMerging).toBe(true);

    await advance(1000);
    expect(fetchMergeJob).toHaveBeenCalledTimes(3);
    expect(result.current.job).toEqual(job("running", 0.7));
  });

  test("次の結合を始めると、前回の断られたメッセージは消え、ジョブは新しいものに替わる", async () => {
    vi.mocked(requestMerge)
      .mockResolvedValueOnce(job("succeeded", 1))
      .mockRejectedValueOnce(new ApiError(409, "merge_in_progress", "別の結合が実行中です"))
      .mockResolvedValueOnce({ ...job("running", 0), id: "job2" });
    const { result } = renderHook(() => useMergeJob());

    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });
    expect(result.current.job?.status).toBe("succeeded");
    expect(result.current.isMerging).toBe(false);

    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });
    expect(result.current.rejectMessage).toBe("別の結合が実行中です");

    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });
    expect(result.current.rejectMessage).toBeNull();
    expect(result.current.job?.id).toBe("job2");
  });

  test("アンマウント後は問い合わせない", async () => {
    vi.mocked(requestMerge).mockResolvedValue(job("running", 0));
    const { result, unmount } = renderHook(() => useMergeJob());
    await act(async () => {
      await result.current.start([video("a"), video("b")]);
    });

    unmount();
    await advance(5000);

    expect(fetchMergeJob).not.toHaveBeenCalled();
  });
});
