import { afterEach, expect, test, vi } from "vitest";
import { deleteVideo } from "../../../../src/features/merge/deleteVideo";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("DELETE /api/videos/{id} を呼ぶ", async () => {
  const fetchStub = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchStub);

  await deleteVideo("abc123");

  expect(fetchStub).toHaveBeenCalledWith("/api/videos/abc123", { method: "DELETE" });
});

test("404 のときはサーバーの message を持つ ApiError で失敗する", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "video_not_found", message: "指定された動画が見つかりません" } }), {
        status: 404,
      }),
    ),
  );

  await expect(deleteVideo("abc123")).rejects.toMatchObject({
    status: 404,
    message: "指定された動画が見つかりません",
  });
});
