import { sumDurationMilliseconds } from "./sumDurationMilliseconds";
import type { MergeItem } from "./types";

/** 結合リストの合計の長さをミリ秒の整数で返す(動画は sumDurationMilliseconds と同じ丸め、テキストの場面は 0.1秒単位 × 100)。 */
export function sumMergeItemsMilliseconds(items: MergeItem[]): number {
  const videoMilliseconds = sumDurationMilliseconds(
    items.flatMap((item) => (item.kind === "video" ? [item.duration_seconds] : [])),
  );
  const textMilliseconds = items.reduce((sum, item) => sum + (item.kind === "text" ? item.durationTenths * 100 : 0), 0);
  return videoMilliseconds + textMilliseconds;
}
