import { afterEach, expect, test, vi } from "vitest";
import { requestMerge } from "../../../../src/features/merge/requestMerge";
import type { MergeItem } from "../../../../src/features/merge/types";

function video(id: string): MergeItem {
  return { kind: "video", id, file_name: `${id}.mp4`, duration_seconds: 1, width: 320, height: 180 };
}

function textScene(id: string, text: string, durationTenths: number): MergeItem {
  return { kind: "text", id, text, durationTenths };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("POST /api/merges に items(動画の場面)を並び順どおりに JSON で送り、ジョブを返す", async () => {
  const job = { id: "job1", status: "running", progress: 0, error: null };
  const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(job), { status: 202 }));
  vi.stubGlobal("fetch", fetchStub);

  const result = await requestMerge([video("c"), video("a"), video("b")]);

  expect(result).toEqual(job);
  expect(fetchStub).toHaveBeenCalledTimes(1);
  const [path, init] = fetchStub.mock.calls[0];
  expect(path).toBe("/api/merges");
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({ "Content-Type": "application/json" });
  expect(JSON.parse(init.body)).toEqual({
    items: [
      { type: "video", video_id: "c" },
      { type: "video", video_id: "a" },
      { type: "video", video_id: "b" },
    ],
  });
});

test("動画とテキストの場面が、渡した並び順どおりに API の形で items に入る", async () => {
  const fetchStub = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: "job1", status: "running", progress: 0, error: null }), { status: 202 }));
  vi.stubGlobal("fetch", fetchStub);

  await requestMerge([textScene("text-1", "京都\n嵐山", 30), video("a"), textScene("text-2", "終", 55)]);

  expect(JSON.parse(fetchStub.mock.calls[0][1].body)).toEqual({
    items: [
      { type: "text", text: "京都\n嵐山", duration_tenths: 30 },
      { type: "video", video_id: "a" },
      { type: "text", text: "終", duration_tenths: 55 },
    ],
  });
});

test.each([
  ["unsupported_characters", "2番目のテキストの場面: 表示できない文字が含まれています: 한"],
  ["output_too_small_for_text", "出力が小さすぎてテキストの場面を描けません"],
  ["invalid_text_scene", "1番目のテキストの場面: 1行は20文字までです(1行目が21文字)"],
])("422 %s のときはサーバーの message を持つ ApiError で失敗する", async (code, message) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, message } }), { status: 422 })),
  );

  await expect(requestMerge([video("a"), textScene("text-1", "x", 30)])).rejects.toMatchObject({
    status: 422,
    code,
    message,
  });
});

test("409 のときはサーバーの message を持つ ApiError で失敗する", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "merge_in_progress", message: "別の結合が実行中です" } }), {
        status: 409,
      }),
    ),
  );

  await expect(requestMerge([video("a"), video("b")])).rejects.toMatchObject({ status: 409, message: "別の結合が実行中です" });
});
