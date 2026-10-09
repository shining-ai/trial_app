import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deleteVideo } from "../../../../src/features/merge/deleteVideo";
import type { MergeItem, VideoItem } from "../../../../src/features/merge/types";
import { checkMergeable } from "../../../../src/features/merge/checkMergeable";
import { useMergeQueue } from "../../../../src/features/merge/useMergeQueue";
import { ApiError } from "../../../../src/lib/apiClient";

// 削除の成功・失敗をテストから制御するため、deleteVideo だけを差し替える
vi.mock("../../../../src/features/merge/deleteVideo", () => ({ deleteVideo: vi.fn() }));

function video(id: string, seconds: number): VideoItem {
  return { kind: "video", id, file_name: `${id}.mp4`, duration_seconds: seconds, width: 640, height: 360 };
}

function ids(result: { current: { items: MergeItem[] } }): string[] {
  return result.current.items.map((item) => item.id);
}

beforeEach(() => {
  vi.mocked(deleteVideo).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.mocked(deleteVideo).mockReset();
});

test("追加した順に並び、totalSeconds に反映される", () => {
  const { result } = renderHook(() => useMergeQueue());

  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 20.5));
  });

  expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]);
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
  expect(ids(result)).toEqual(["b"]);
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
  expect(ids(result)).toEqual(["b"]);
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
  expect(ids(result)).toEqual(["a"]);
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
  expect(ids(result)).toEqual(["a"]);
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
  expect(ids(result)).toEqual(["c", "a", "b"]);

  act(() => {
    result.current.move(1, "down");
  });
  expect(ids(result)).toEqual(["c", "b", "a"]);
});

function mergeable(totalSeconds: number, count: number) {
  return checkMergeable({ videoCount: count, itemCount: count, totalSeconds, isMerging: false, isEditing: false }).mergeable;
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
  expect(ids(result)).toEqual(["a", "c"]);
  expect(result.current.totalSeconds).toBe(40);

  await act(async () => {
    rejectDelete(new ApiError(500, "internal", "削除できませんでした"));
    await pending;
  });
  expect(ids(result)).toEqual(["a", "b", "c"]);
  expect(result.current.deleteError).toBe("削除できませんでした");
});

function textOf(item: MergeItem | undefined): { text: string; durationTenths: number } | null {
  return item?.kind === "text" ? { text: item.text, durationTenths: item.durationTenths } : null;
}

function pendingDelete() {
  const control: { reject: (error: unknown) => void } = { reject: () => {} };
  vi.mocked(deleteVideo).mockImplementation(
    () => new Promise((_resolve, reject) => { control.reject = reject; }),
  );
  return control;
}

test("「先頭にテキストを挿入」で確定すると先頭に入り、入力欄が閉じる", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 10));
  });

  act(() => {
    result.current.openInsert(null);
  });
  expect(result.current.editor).toEqual({ mode: "insert", afterId: null });
  act(() => {
    result.current.confirmText("京都", 30);
  });

  expect(result.current.items.map((item) => item.kind)).toEqual(["text", "video", "video"]);
  expect(textOf(result.current.items[0])).toEqual({ text: "京都", durationTenths: 30 });
  expect(result.current.editor).toBeNull();
  expect(result.current.editorError).toBeNull();
});

test("行1の後に挿入すると2番目に入り、末尾の行の後に挿入すると末尾に入る", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 10));
  });

  act(() => {
    result.current.openInsert("a");
  });
  act(() => {
    result.current.confirmText("一", 30);
  });
  expect(result.current.items.map((item) => item.kind)).toEqual(["video", "text", "video"]);
  expect(result.current.items[0].id).toBe("a");
  expect(result.current.items[2].id).toBe("b");

  act(() => {
    result.current.openInsert("b");
  });
  act(() => {
    result.current.confirmText("二", 55);
  });
  expect(result.current.items.map((item) => item.kind)).toEqual(["video", "text", "video", "text"]);
  expect(textOf(result.current.items[3])).toEqual({ text: "二", durationTenths: 55 });
});

test("テキストの場面の id は確定した順に text-1, text-2 と数える", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
  });

  act(() => {
    result.current.openInsert(null);
  });
  act(() => {
    result.current.confirmText("一", 30);
  });
  act(() => {
    result.current.openInsert(null);
  });
  act(() => {
    result.current.confirmText("二", 30);
  });

  expect(ids(result)).toEqual(["text-2", "text-1", "a"]);
});

test("編集で文言と表示時間を変えると、同じ位置・同じ id のまま置き換わり、入力欄が閉じる", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 10));
  });
  act(() => {
    result.current.openInsert("a");
  });
  act(() => {
    result.current.confirmText("旧", 30);
  });

  act(() => {
    result.current.openEdit("text-1");
  });
  expect(result.current.editor).toEqual({ mode: "edit", id: "text-1" });
  act(() => {
    result.current.confirmText("新", 20);
  });

  expect(ids(result)).toEqual(["a", "text-1", "b"]);
  expect(textOf(result.current.items[1])).toEqual({ text: "新", durationTenths: 20 });
  expect(result.current.editor).toBeNull();
});

test("入力欄を取り消すと、一覧は変わらず入力欄が閉じる", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
  });
  act(() => {
    result.current.openInsert("a");
  });

  act(() => {
    result.current.closeEditor();
  });

  expect(result.current.editor).toBeNull();
  expect(ids(result)).toEqual(["a"]);
});

test("テキストの場面の削除では deleteVideo を呼ばず、一覧から外れる", async () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
  });
  act(() => {
    result.current.openInsert("a");
  });
  act(() => {
    result.current.confirmText("見出し", 30);
  });

  let message: string | null = "unset";
  await act(async () => {
    message = await result.current.removeItem("text-1");
  });

  expect(deleteVideo).not.toHaveBeenCalled();
  expect(message).toBeNull();
  expect(ids(result)).toEqual(["a"]);
  expect(result.current.deleteError).toBeNull();
});

test("テキストの場面の並べ替えが items の順に反映される", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 10));
  });
  act(() => {
    result.current.openInsert("a");
  });
  act(() => {
    result.current.confirmText("見出し", 30);
  });
  expect(ids(result)).toEqual(["a", "text-1", "b"]);

  act(() => {
    result.current.move(1, "top");
  });
  expect(ids(result)).toEqual(["text-1", "a", "b"]);

  act(() => {
    result.current.move(0, "bottom");
  });
  expect(ids(result)).toEqual(["a", "b", "text-1"]);
});

test("totalSeconds は動画1.5秒 + テキストの場面55(5.5秒)で7.0。videoCount はテキストの場面を数えない", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 1.5));
  });
  act(() => {
    result.current.openInsert("a");
  });
  act(() => {
    result.current.confirmText("見出し", 55);
  });

  expect(result.current.totalSeconds).toBe(7);
  expect(result.current.videoCount).toBe(1);
  expect(result.current.items).toHaveLength(2);
});

test("動画の削除が失敗したとき、テキストの場面が間にあっても元の位置に戻る", async () => {
  const control = pendingDelete();
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 10));
    result.current.addItem(video("c", 10));
  });
  act(() => {
    result.current.openInsert("a");
  });
  act(() => {
    result.current.confirmText("一", 30);
  });
  act(() => {
    result.current.openInsert("b");
  });
  act(() => {
    result.current.confirmText("二", 30);
  });
  expect(ids(result)).toEqual(["a", "text-1", "b", "text-2", "c"]);

  let pending: Promise<string | null> = Promise.resolve(null);
  act(() => {
    pending = result.current.removeItem("b");
  });
  expect(ids(result)).toEqual(["a", "text-1", "text-2", "c"]);
  await act(async () => {
    control.reject(new ApiError(500, "internal", "削除できませんでした"));
    await pending;
  });

  expect(ids(result)).toEqual(["a", "text-1", "b", "text-2", "c"]);
});

test("入力欄が開いている間は、move と removeItem を呼んでも並びが変わらず、deleteVideo も呼ばれない", async () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 10));
  });
  act(() => {
    result.current.openInsert("a");
  });

  act(() => {
    result.current.move(1, "up");
  });
  await act(async () => {
    await result.current.removeItem("a");
  });

  expect(ids(result)).toEqual(["a", "b"]);
  expect(deleteVideo).not.toHaveBeenCalled();

  act(() => {
    result.current.closeEditor();
  });
  act(() => {
    result.current.move(1, "up");
  });
  expect(ids(result)).toEqual(["b", "a"]);
});

test("編集の入力欄が開いている間も、move と、テキストの場面の removeItem は何もしない", async () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
  });
  act(() => {
    result.current.openInsert("a");
  });
  act(() => {
    result.current.confirmText("見出し", 30);
  });
  act(() => {
    result.current.openEdit("text-1");
  });

  act(() => {
    result.current.move(1, "top");
  });
  await act(async () => {
    await result.current.removeItem("text-1");
  });

  expect(ids(result)).toEqual(["a", "text-1"]);
});

test("Bの後に挿入する入力欄を開いている間に、先に始めていたAの削除が失敗してAが戻っても、確定するとBの直後に入る", async () => {
  const control = pendingDelete();
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
    result.current.addItem(video("b", 10));
    result.current.addItem(video("c", 10));
  });
  let pending: Promise<string | null> = Promise.resolve(null);
  act(() => {
    pending = result.current.removeItem("a");
  });
  act(() => {
    result.current.openInsert("b");
  });
  await act(async () => {
    control.reject(new ApiError(500, "internal", "削除できませんでした"));
    await pending;
  });
  expect(ids(result)).toEqual(["a", "b", "c"]);

  act(() => {
    result.current.confirmText("見出し", 30);
  });

  expect(ids(result)).toEqual(["a", "b", "text-1", "c"]);
});

test("挿入の直前の項目が一覧にないとき、確定しても入らず、入力欄を閉じずに理由を返す", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
  });
  act(() => {
    result.current.openInsert("gone");
  });

  act(() => {
    result.current.confirmText("見出し", 30);
  });

  expect(ids(result)).toEqual(["a"]);
  expect(result.current.editor).toEqual({ mode: "insert", afterId: "gone" });
  expect(result.current.editorError).toBe("挿入する位置の項目がなくなりました。取り消して、もう一度挿入してください");
});

test("位置のエラーは、入力欄を取り消すと消え、失敗した id は次に付ける id を消費しない", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 10));
  });
  act(() => {
    result.current.openInsert("gone");
  });
  act(() => {
    result.current.confirmText("見出し", 30);
  });
  expect(result.current.editorError).not.toBeNull();

  act(() => {
    result.current.closeEditor();
  });
  expect(result.current.editorError).toBeNull();

  act(() => {
    result.current.openInsert("a");
  });
  act(() => {
    result.current.confirmText("見出し", 30);
  });
  expect(ids(result)).toEqual(["a", "text-1"]);
});

test("アップロードが届いた直後(画面に反映される前)に確定しても、届いた動画は一覧から消えない", () => {
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 1));
    result.current.addItem(video("b", 1));
  });
  act(() => {
    result.current.openInsert("b");
  });

  act(() => {
    result.current.addItem(video("c", 1));
    result.current.confirmText("見出し", 30);
  });

  expect(ids(result)).toEqual(["a", "b", "text-1", "c"]);
});

test("削除の失敗で動画が戻った直後(画面に反映される前)に確定しても、戻った動画は一覧から消えない", async () => {
  const control = pendingDelete();
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 1));
    result.current.addItem(video("b", 1));
  });
  let pending: Promise<string | null> = Promise.resolve(null);
  act(() => {
    pending = result.current.removeItem("a");
  });
  act(() => {
    result.current.openInsert("b");
  });

  await act(async () => {
    control.reject(new ApiError(500, "internal", "削除できませんでした"));
    await pending;
    result.current.confirmText("見出し", 30);
  });

  expect(ids(result)).toEqual(["a", "b", "text-1"]);
});

test("削除の完了を待つ間に先頭へ見出しを挿入し、削除が失敗しても、見出しは先頭のまま", async () => {
  const control = pendingDelete();
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 1));
    result.current.addItem(video("b", 1));
    result.current.addItem(video("c", 1));
  });
  let pending: Promise<string | null> = Promise.resolve(null);
  act(() => {
    pending = result.current.removeItem("a");
  });
  act(() => {
    result.current.openInsert(null);
  });
  act(() => {
    result.current.confirmText("オープニング", 30);
  });

  await act(async () => {
    control.reject(new ApiError(500, "internal", "削除できませんでした"));
    await pending;
  });

  expect(ids(result)).toEqual(["text-1", "a", "b", "c"]);
});

test("削除の完了を待つ間に並べ替えても、削除が失敗した動画は元の直後の項目の前に戻る", async () => {
  const control = pendingDelete();
  const { result } = renderHook(() => useMergeQueue());
  act(() => {
    result.current.addItem(video("a", 1));
    result.current.addItem(video("b", 1));
    result.current.addItem(video("c", 1));
  });
  let pending: Promise<string | null> = Promise.resolve(null);
  act(() => {
    pending = result.current.removeItem("a");
  });
  act(() => {
    result.current.move(1, "top");
  });
  expect(ids(result)).toEqual(["c", "b"]);

  await act(async () => {
    control.reject(new ApiError(500, "internal", "削除できませんでした"));
    await pending;
  });

  expect(ids(result)).toEqual(["c", "a", "b"]);
});
