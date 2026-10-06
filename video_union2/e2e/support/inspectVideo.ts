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
