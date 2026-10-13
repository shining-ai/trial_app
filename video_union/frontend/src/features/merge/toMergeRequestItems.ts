import type { MergeItem } from "./types";

export type MergeRequestItem =
  | { type: "video"; video_id: string }
  | { type: "text"; text: string; duration_tenths: number };

/** 結合リストを API の items の形にする(呼ぶのは requestMerge だけ)。 */
export function toMergeRequestItems(items: MergeItem[]): MergeRequestItem[] {
  return items.map((item) =>
    item.kind === "video"
      ? { type: "video", video_id: item.id }
      : { type: "text", text: item.text, duration_tenths: item.durationTenths },
  );
}
