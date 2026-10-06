import { formatExcess } from "./formatExcess";

export const MAX_TOTAL_SECONDS = 1800;
const MIN_VIDEOS = 2;

export type MergeCheck = {
  mergeable: boolean;
  reason: "merging" | "too_few" | "too_long" | null;
  message: string | null;
  excessSeconds: number;
};

export function checkMergeable(input: { count: number; totalSeconds: number; isMerging: boolean }): MergeCheck {
  // サーバーと同じく、ミリ秒に丸めて比べる(浮動小数の誤差で境界がずれないようにする)
  const excessMilliseconds = Math.max(0, Math.round(input.totalSeconds * 1000) - MAX_TOTAL_SECONDS * 1000);
  const excessSeconds = excessMilliseconds / 1000;

  if (input.isMerging) {
    return { mergeable: false, reason: "merging", message: "結合中です", excessSeconds };
  }
  if (input.count < MIN_VIDEOS) {
    return { mergeable: false, reason: "too_few", message: "結合するには2本以上の動画が必要です", excessSeconds };
  }
  if (excessMilliseconds > 0) {
    return {
      mergeable: false,
      reason: "too_long",
      message: `結合後の長さが30分を${formatExcess(excessSeconds)}超えています`,
      excessSeconds,
    };
  }
  return { mergeable: true, reason: null, message: null, excessSeconds };
}
