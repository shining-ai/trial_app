import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, apiFetch, toApiError } from "../../../src/lib/apiClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toApiError", () => {
  test("共通のエラー形式から status・code・message を取り出す", () => {
    const error = toApiError(
      422,
      JSON.stringify({ error: { code: "not_a_video", message: "動画として読み込めませんでした" } }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe("not_a_video");
    expect(error.message).toBe("動画として読み込めませんでした");
  });

  test("本文が JSON でないときは status を残し、code を unknown、message を固定の文言にする", () => {
    const error = toApiError(502, "<html>Bad Gateway</html>");

    expect(error.status).toBe(502);
    expect(error.code).toBe("unknown");
    expect(error.message).toBe("サーバーとの通信に失敗しました");
  });

  test("JSON でも error の形でないときは固定の文言にする", () => {
    const error = toApiError(500, JSON.stringify({ detail: "oops" }));

    expect(error.code).toBe("unknown");
    expect(error.message).toBe("サーバーとの通信に失敗しました");
  });
});

describe("apiFetch", () => {
  test("成功したら JSON を返し、指定したパスと設定で fetch を呼ぶ", async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "abc" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchStub);

    const result = await apiFetch<{ id: string }>("/api/merges/abc", { method: "GET" });

    expect(result).toEqual({ id: "abc" });
    expect(fetchStub).toHaveBeenCalledWith("/api/merges/abc", { method: "GET" });
  });

  test("204 のときは本文を読まず undefined を返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const result = await apiFetch<void>("/api/videos/abc", { method: "DELETE" });

    expect(result).toBeUndefined();
  });

  test("失敗したらサーバーの message を持つ ApiError を投げる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "merge_in_progress", message: "別の結合が実行中です" } }),
          { status: 409 },
        ),
      ),
    );

    const failure = apiFetch("/api/merges", { method: "POST" });

    await expect(failure).rejects.toMatchObject({
      status: 409,
      code: "merge_in_progress",
      message: "別の結合が実行中です",
    });
  });
});
