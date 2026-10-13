import { formatDateHeading } from "./formatDateHeading";
import { parseShootingDateTime } from "./parseShootingDateTime";
import type { MergeItem, TextSceneItem } from "./types";

const HEADING_DURATION_TENTHS = 10;
// 「2025年8月4日」の形の文。動画がなくなった日の見出しも、ほかの日の見出しをまたいで入れ替えないための目印にする
const DATE_HEADING_TEXT = /^\d{1,4}年\d{1,2}月\d{1,2}日$/;

/**
 * 日付の見出しを「その日の見出し」として、撮影日が変わる位置(その日の最初の動画の直前に続くテキストの場面のかたまりの前)に置き直す。
 * - 動画に出てくる日付と同じ文のテキストの場面を、日付の見出しとみなす。同じ日付の見出しが複数あれば最初の1つ(id と表示時間はそのまま)にまとめる
 * - nextId を渡すと、見出しのない日に新しく作る(表示時間1秒)。null なら作らず、既にある見出しを置き直すだけ
 * - 撮影日時を読めない動画は、見出しを付けず、日付の判定にも使わない。並びは変えない
 */
export function placeDateHeadings(items: MergeItem[], nextId: (() => string) | null): MergeItem[] {
  const headingTexts = new Set<string>();
  for (const item of items) {
    if (item.kind !== "video") continue;
    const shot = parseShootingDateTime(item.file_name);
    if (shot) headingTexts.add(formatDateHeading(shot.date));
  }

  const existing = new Map<string, TextSceneItem>();
  const isDateHeading = (item: MergeItem): item is TextSceneItem => item.kind === "text" && headingTexts.has(item.text);
  for (const item of items) {
    if (isDateHeading(item) && !existing.has(item.text)) existing.set(item.text, item);
  }

  const result: MergeItem[] = [];
  let previousDate: string | null = null;
  const placed = new Set<string>();
  for (const item of items) {
    if (isDateHeading(item)) continue;
    if (item.kind === "video") {
      const shot = parseShootingDateTime(item.file_name);
      if (shot && shot.date !== previousDate) {
        previousDate = shot.date;
        const text = formatDateHeading(shot.date);
        // 同じ日付が離れた2か所に出る(並べていない)ときは、最初の1か所にだけ付ける
        if (!placed.has(text)) {
          const heading =
            existing.get(text) ??
            (nextId ? { kind: "text" as const, id: nextId(), text, durationTenths: HEADING_DURATION_TENTHS } : null);
          if (heading) {
            let runStart = result.length;
            // 直前に続くテキストの場面のかたまりの前へさかのぼる。ただし日付の形の見出しはまたがない
            // (その日の動画を全部消して残った見出しと、入れ替わらないようにする)
            while (runStart > 0 && isPlainText(result[runStart - 1])) runStart -= 1;
            result.splice(runStart, 0, heading);
            placed.add(text);
          }
        }
      }
    }
    result.push(item);
  }
  return result;
}

/** 日付の形ではないテキストの場面か(見出しを入れる位置をさかのぼるときに、またいでよいもの) */
function isPlainText(item: MergeItem): boolean {
  return item.kind === "text" && !DATE_HEADING_TEXT.test(item.text);
}
