import { afterEach, expect, test, vi } from "vitest";
import { fetchMergeJob } from "../../../../src/features/merge/fetchMergeJob";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("GET /api/merges/{job_id} を呼び、ジョブを返す", async () => {
  const job = { id: "job1", status: "running", progress: 0.5, error: null };
  const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(job), { status: 200 }));
  vi.stubGlobal("fetch", fetchStub);

  const result = await fetchMergeJob("job1");

  expect(result).toEqual(job);
  expect(fetchStub).toHaveBeenCalledWith("/api/merges/job1", undefined);
});

test("404 のときは ApiError で失敗する", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "job_not_found", message: "結合が見つかりません" } }), {
        status: 404,
      }),
    ),
  );

  await expect(fetchMergeJob("job1")).rejects.toMatchObject({ status: 404, message: "結合が見つかりません" });
});
