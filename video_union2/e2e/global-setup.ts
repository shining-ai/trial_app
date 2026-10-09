import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { VIDEO_DIR, videoPath } from "./support/videos";

function makeVideo(name: string, color: string, width: number, height: number, seconds: number, fps = 30) {
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=c=${color}:s=${width}x${height}:r=${fps}:d=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    videoPath(name),
  ]);
}

export default function globalSetup() {
  mkdirSync(VIDEO_DIR, { recursive: true });
  makeVideo("red.mp4", "red", 320, 180, 1);
  makeVideo("green.mp4", "green", 320, 180, 1);
  makeVideo("blue.mp4", "blue", 320, 180, 1);
  makeVideo("portrait.mp4", "green", 180, 320, 1);
  // 30分を超える組み合わせの確認用(低解像度・1fps なので数秒で作れる)
  makeVideo("long-a.mp4", "red", 16, 16, 901, 1);
  makeVideo("long-b.mp4", "blue", 16, 16, 901, 1);
  // テキストの場面を足すと30分を超える組み合わせの確認用(901秒 + 899秒 = 30:00 ちょうど。テキストの場面1.0秒で 30:01)
  makeVideo("long-899.mp4", "blue", 16, 16, 899, 1);
  writeFileSync(videoPath("not_a_video.mp4"), "これは動画ではなく、拡張子だけが .mp4 のテキストファイルです。\n");
}
