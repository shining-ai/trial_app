import { formatDateHeading } from "./formatDateHeading";
import { parseShootingDateTime } from "./parseShootingDateTime";
import type { MergeItem } from "./types";

/**
 * 撮影日が前の読めた動画と変わる動画の前に、日付の見出し(テキストの場面)を入れる。
 * 見出しは、その動画の直前に続くテキストの場面のかたまりの前に入れる。
 * そのかたまりに同じ文のテキストの場面があれば入れない。読めない動画は付けず、日付の判定にも使わない。
 */
export function insertDateHeadings(items: MergeItem[], nextId: () => string): MergeItem[] {
  const result: MergeItem[] = [];
  let previousDate: string | null = null;

  for (const item of items) {
    if (item.kind === "video") {
      const shot = parseShootingDateTime(item.file_name);
      if (shot && shot.date !== previousDate) {
        previousDate = shot.date;
        const heading = formatDateHeading(shot.date);
        let runStart = result.length;
        while (runStart > 0 && result[runStart - 1].kind === "text") runStart -= 1;
        const alreadyHasHeading = result.slice(runStart).some((r) => r.kind === "text" && r.text === heading);
        if (!alreadyHasHeading) {
          result.splice(runStart, 0, { kind: "text", id: nextId(), text: heading, durationTenths: 10 });
        }
      }
    }
    result.push(item);
  }

  return result;
}
