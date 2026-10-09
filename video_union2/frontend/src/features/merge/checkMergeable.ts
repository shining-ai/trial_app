import { formatExcess } from "./formatExcess";

export const MAX_TOTAL_SECONDS = 1800;
const MIN_VIDEOS = 1;
const MIN_ITEMS = 2;

export type MergeCheck = {
  mergeable: boolean;
  reason: "merging" | "editing" | "no_video" | "too_few" | "too_long" | null;
  message: string | null;
  excessSeconds: number;
};

export function checkMergeable(input: {
  videoCount: number;
  itemCount: number;
  totalSeconds: number;
  isMerging: boolean;
  isEditing: boolean;
}): MergeCheck {
  // サーバーと同じく、ミリ秒に丸めて比べる(浮動小数の誤差で境界がずれないようにする)
  const excessMilliseconds = Math.max(0, Math.round(input.totalSeconds * 1000) - MAX_TOTAL_SECONDS * 1000);
  const excessSeconds = excessMilliseconds / 1000;

  if (input.isMerging) {
    return { mergeable: false, reason: "merging", message: "結合中です", excessSeconds };
  }
  if (input.isEditing) {
    return {
      mergeable: false,
      reason: "editing",
      message: "テキストの入力を確定するか取り消してください",
      excessSeconds,
    };
  }
  if (input.videoCount < MIN_VIDEOS) {
    return { mergeable: false, reason: "no_video", message: "結合するには動画が1本以上必要です", excessSeconds };
  }
  if (input.itemCount < MIN_ITEMS) {
    return {
      mergeable: false,
      reason: "too_few",
      message: "結合するには動画とテキストの場面を合わせて2つ以上必要です",
      excessSeconds,
    };
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
