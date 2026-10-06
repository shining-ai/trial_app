import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { uploadVideo } from "../../../../src/features/upload/uploadVideo";
import { ApiError } from "../../../../src/lib/apiClient";

// ブラウザの XHR の代わりに、送った内容を記録し、応答を手元から返せる偽物を使う
class FakeXhr {
  static instances: FakeXhr[] = [];

  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.body = body;
  }

  respond(status: number, responseText: string) {
    this.status = status;
    this.responseText = responseText;
    this.onload?.();
  }
}

beforeEach(() => {
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastXhr(): FakeXhr {
  return FakeXhr.instances[FakeXhr.instances.length - 1];
}

test("ファイルそのものを octet-stream で POST /api/videos に送り、ファイル名を URL エンコードして X-File-Name に入れる", () => {
  const file = new File(["data"], "夏 休み.mp4", { type: "video/mp4" });

  void uploadVideo(file, () => {});

  const xhr = lastXhr();
  expect(xhr.method).toBe("POST");
  expect(xhr.url).toBe("/api/videos");
  expect(xhr.headers["Content-Type"]).toBe("application/octet-stream");
  expect(xhr.headers["X-File-Name"]).toBe(encodeURIComponent("夏 休み.mp4"));
  expect(xhr.body).toBe(file);
});

test("送信の進み具合を 0〜1 の割合で通知する", () => {
  const progress: number[] = [];
  void uploadVideo(new File(["data"], "a.mp4"), (fraction) => progress.push(fraction));

  lastXhr().upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
  lastXhr().upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });

  expect(progress).toEqual([0.25, 1]);
});

test("全体の大きさが分からない進み具合の通知は無視する", () => {
  const progress: number[] = [];
  void uploadVideo(new File(["data"], "a.mp4"), (fraction) => progress.push(fraction));

  lastXhr().upload.onprogress?.({ lengthComputable: false, loaded: 25, total: 0 });

  expect(progress).toEqual([]);
});

test("201 のときは応答の VideoResponse を返す", async () => {
  const video = { id: "a".repeat(32), file_name: "a.mp4", duration_seconds: 2, width: 640, height: 360 };
  const result = uploadVideo(new File(["data"], "a.mp4"), () => {});

  lastXhr().respond(201, JSON.stringify(video));

  await expect(result).resolves.toEqual(video);
});

test("422 のときはサーバーの message を持つ ApiError で失敗する", async () => {
  const result = uploadVideo(new File(["data"], "a.mp4"), () => {});

  lastXhr().respond(
    422,
    JSON.stringify({ error: { code: "not_a_video", message: "動画として読み込めませんでした" } }),
  );

  await expect(result).rejects.toBeInstanceOf(ApiError);
  await expect(result).rejects.toMatchObject({
    status: 422,
    code: "not_a_video",
    message: "動画として読み込めませんでした",
  });
});

test("通信そのものが失敗したときは、接続できなかったことを示す ApiError で失敗する", async () => {
  const result = uploadVideo(new File(["data"], "a.mp4"), () => {});

  lastXhr().onerror?.();

  await expect(result).rejects.toMatchObject({
    status: 0,
    code: "network_error",
    message: "サーバーに接続できませんでした",
  });
});
