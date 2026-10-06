import { afterEach, expect, test, vi } from "vitest";
import { requestMerge } from "../../../../src/features/merge/requestMerge";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("POST /api/merges に video_ids を並び順どおりに JSON で送り、ジョブを返す", async () => {
  const job = { id: "job1", status: "running", progress: 0, error: null };
  const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(job), { status: 202 }));
  vi.stubGlobal("fetch", fetchStub);

  const result = await requestMerge(["c", "a", "b"]);

  expect(result).toEqual(job);
  expect(fetchStub).toHaveBeenCalledTimes(1);
  const [path, init] = fetchStub.mock.calls[0];
  expect(path).toBe("/api/merges");
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({ "Content-Type": "application/json" });
  expect(JSON.parse(init.body)).toEqual({ video_ids: ["c", "a", "b"] });
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

  await expect(requestMerge(["a", "b"])).rejects.toMatchObject({ status: 409, message: "別の結合が実行中です" });
});
