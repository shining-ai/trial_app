import { execFileSync, spawnSync } from "node:child_process";

type Stream = { codec_type: string; width?: number; height?: number; duration?: string };

/** ffprobe で動画の長さ(秒)と映像のサイズを返す。 */
export function probeVideo(path: string): { durationSeconds: number; width: number; height: number } {
  const output = execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]);
  const info = JSON.parse(output.toString()) as { format: { duration: string }; streams: Stream[] };
  const video = info.streams.find((s) => s.codec_type === "video");
  if (!video?.width || !video.height) throw new Error("映像ストリームがありません");
  return { durationSeconds: Number(info.format.duration), width: video.width, height: video.height };
}

/** 指定時刻のフレームの (x, y) の RGB を返す。 */
export function samplePixel(path: string, atSeconds: number, x: number, y: number): [number, number, number] {
  const output = execFileSync("ffmpeg", [
    "-v", "error", "-ss", String(atSeconds), "-i", path,
    "-frames:v", "1", "-vf", `crop=2:2:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
  ]);
  return [output[0], output[1], output[2]];
}

/**
 * 指定時刻のフレームで、R・G・B のどれかが threshold を超える画素の外接矩形を返す(right・bottom は含む座標)。
 * 明るい画素がなければ null。backend の tests/support/bright_bbox.py と同じ考え方。
 */
export function brightBoundingBox(
  path: string,
  atSeconds: number,
  threshold = 128,
): { left: number; top: number; right: number; bottom: number } | null {
  const { width, height } = probeVideo(path);
  const pixels = execFileSync(
    "ffmpeg",
    ["-v", "error", "-ss", String(atSeconds), "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: width * height * 3 + 1024 },
  );
  if (pixels.length !== width * height * 3) throw new Error("フレームの大きさが動画の幅と高さに合いません");
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > threshold) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return right < 0 ? null : { left, top, right, bottom };
}

/** 圧縮による色のずれを許して、2つの色が近いかを判定する。 */
export function isCloseColor(actual: [number, number, number], expected: [number, number, number], tolerance = 40) {
  return actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance);
}

/** 最後までデコードしてエラーがないか(成功したか、エラー出力)を返す。 */
export function decodesToEnd(path: string): { ok: boolean; stderr: string } {
  const result = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"]);
  const stderr = result.stderr.toString().trim();
  return { ok: result.status === 0 && stderr === "", stderr };
}
