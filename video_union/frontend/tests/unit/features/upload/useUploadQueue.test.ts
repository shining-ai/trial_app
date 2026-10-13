import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { VideoResponse } from "../../../../src/features/upload/types";
import { uploadVideo } from "../../../../src/features/upload/uploadVideo";
import { useUploadQueue } from "../../../../src/features/upload/useUploadQueue";
import { ApiError } from "../../../../src/lib/apiClient";

// 通信の開始と完了をテストから制御するため、uploadVideo だけを差し替える
vi.mock("../../../../src/features/upload/uploadVideo", () => ({ uploadVideo: vi.fn() }));

type Pending = {
  file: File;
  onProgress: (fraction: number) => void;
  resolve: (video: VideoResponse) => void;
  reject: (error: Error) => void;
};

let calls: Pending[] = [];

function videoFor(name: string): VideoResponse {
  return { id: `id-${name}`.padEnd(32, "0"), file_name: name, duration_seconds: 2, width: 640, height: 360 };
}

beforeEach(() => {
  calls = [];
  vi.mocked(uploadVideo).mockImplementation(
    (file, onProgress) =>
      new Promise<VideoResponse>((resolve, reject) => {
        calls.push({ file, onProgress, resolve, reject });
      }),
  );
});

afterEach(() => {
  cleanup();
  vi.mocked(uploadVideo).mockReset();
});

function names(): string[] {
  return calls.map((call) => call.file.name);
}

test("3ファイルを入れると同時に2本だけ送信が始まり、1本終わると3本目が始まる", async () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 0, onUploaded: () => {} }));

  act(() => {
    result.current.addFiles([new File(["1"], "a.mp4"), new File(["2"], "b.mp4"), new File(["3"], "c.mp4")]);
  });

  expect(names()).toEqual(["a.mp4", "b.mp4"]);
  expect(result.current.items.map((item) => item.status)).toEqual(["uploading", "uploading", "pending"]);

  await act(async () => {
    calls[0].resolve(videoFor("a.mp4"));
  });

  expect(names()).toEqual(["a.mp4", "b.mp4", "c.mp4"]);
  expect(result.current.items.map((item) => item.status)).toEqual(["done", "uploading", "uploading"]);
});

test("完了した動画を onUploaded に渡し、項目に動画の情報を持たせる", async () => {
  const onUploaded = vi.fn();
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 0, onUploaded }));
  act(() => {
    result.current.addFiles([new File(["1"], "a.mp4")]);
  });

  await act(async () => {
    calls[0].resolve(videoFor("a.mp4"));
  });

  expect(onUploaded).toHaveBeenCalledTimes(1);
  expect(onUploaded).toHaveBeenCalledWith(videoFor("a.mp4"));
  expect(result.current.items[0].video).toEqual(videoFor("a.mp4"));
  expect(result.current.items[0].progress).toBe(1);
});

test("送信の進み具合が項目に反映される", () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 0, onUploaded: () => {} }));
  act(() => {
    result.current.addFiles([new File(["1"], "a.mp4")]);
  });

  act(() => {
    calls[0].onProgress(0.4);
  });

  expect(result.current.items[0].progress).toBe(0.4);
});

test("4GB超のファイルは uploadVideo が呼ばれず、失敗の理由が「ファイルサイズが上限の4GBを超えています」になる", () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 0, onUploaded: () => {} }));
  const big = new File(["x"], "big.mp4");
  Object.defineProperty(big, "size", { value: 4294967297 });

  act(() => {
    result.current.addFiles([big]);
  });

  expect(calls).toHaveLength(0);
  expect(result.current.items).toHaveLength(1);
  expect(result.current.items[0].status).toBe("failed");
  expect(result.current.items[0].errorMessage).toBe("ファイルサイズが上限の4GBを超えています");
});

test("4GBちょうどのファイルは送信される", () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 0, onUploaded: () => {} }));
  const exact = new File(["x"], "exact.mp4");
  Object.defineProperty(exact, "size", { value: 4294967296 });

  act(() => {
    result.current.addFiles([exact]);
  });

  expect(names()).toEqual(["exact.mp4"]);
});

test("1本が失敗しても、サーバーの message を残し、次の項目の送信が始まる", async () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 0, onUploaded: () => {} }));
  act(() => {
    result.current.addFiles([new File(["1"], "a.mp4"), new File(["2"], "b.mp4"), new File(["3"], "c.mp4")]);
  });

  await act(async () => {
    calls[0].reject(new ApiError(422, "not_a_video", "動画として読み込めませんでした"));
  });

  expect(names()).toEqual(["a.mp4", "b.mp4", "c.mp4"]);
  expect(result.current.items[0].status).toBe("failed");
  expect(result.current.items[0].errorMessage).toBe("動画として読み込めませんでした");
});

test("ApiError でない失敗は、固定の文言で失敗にする", async () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 0, onUploaded: () => {} }));
  act(() => {
    result.current.addFiles([new File(["1"], "a.mp4")]);
  });

  await act(async () => {
    calls[0].reject(new Error("boom"));
  });

  expect(result.current.items[0].status).toBe("failed");
  expect(result.current.items[0].errorMessage).toBe("アップロードに失敗しました");
});

test("残り枠を超えて選ぶと、超えた分は追加されず limitExceeded になる", () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 99, onUploaded: () => {} }));

  act(() => {
    result.current.addFiles([new File(["1"], "a.mp4"), new File(["2"], "b.mp4")]);
  });

  expect(result.current.items.map((item) => item.file.name)).toEqual(["a.mp4"]);
  expect(result.current.limitExceeded).toBe(true);
});

test("残り枠は「100 − 結合リスト − 送信中 − 待機中」で数える", () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 90, onUploaded: () => {} }));
  expect(result.current.remainingSlots).toBe(10);

  act(() => {
    result.current.addFiles([
      new File(["1"], "a.mp4"),
      new File(["2"], "b.mp4"),
      new File(["3"], "c.mp4"),
      new File(["4"], "d.mp4"),
    ]);
  });

  // 送信中2本 + 待機中2本
  expect(result.current.remainingSlots).toBe(6);
});

test("4GB超で失敗した項目は枠を使わない", () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 99, onUploaded: () => {} }));
  const big = new File(["x"], "big.mp4");
  Object.defineProperty(big, "size", { value: 4294967297 });

  act(() => {
    result.current.addFiles([big, new File(["1"], "a.mp4")]);
  });

  expect(result.current.items.map((item) => item.status)).toEqual(["failed", "uploading"]);
  expect(result.current.limitExceeded).toBe(false);
});

test("次に選ぶと limitExceeded は解除される", () => {
  const { result } = renderHook(() => useUploadQueue({ mergeCount: 99, onUploaded: () => {} }));
  act(() => {
    result.current.addFiles([new File(["1"], "a.mp4"), new File(["2"], "b.mp4")]);
  });
  expect(result.current.limitExceeded).toBe(true);

  act(() => {
    result.current.addFiles([]);
  });

  expect(result.current.limitExceeded).toBe(false);
});
