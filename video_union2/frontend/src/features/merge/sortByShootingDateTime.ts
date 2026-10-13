import { parseShootingDateTime } from "./parseShootingDateTime";
import { placeDateHeadings } from "./placeDateHeadings";
import type { MergeItem } from "./types";

type Chunk = { items: MergeItem[]; key: string | null };

/**
 * 動画を撮影日時の古い順に並べる(テキストの場面は直後の動画と一緒に動く)。読めない動画は読めたものの後ろに元の順で置く。
 * 並べたあと、既にある日付の見出しは、その日の最初の動画の前へ置き直す(新しくは作らない)。
 */
export function sortByShootingDateTime(items: MergeItem[]): MergeItem[] {
  return placeDateHeadings(sortChunks(items), null);
}

function sortChunks(items: MergeItem[]): MergeItem[] {
  const chunks: Chunk[] = [];
  let pending: MergeItem[] = [];
  for (const item of items) {
    pending.push(item);
    if (item.kind === "video") {
      chunks.push({ items: pending, key: parseShootingDateTime(item.file_name)?.key ?? null });
      pending = [];
    }
  }
  const trailing = pending;

  const readable = chunks
    .filter((chunk) => chunk.key !== null)
    .sort((a, b) => (a.key as string).localeCompare(b.key as string));
  const unreadable = chunks.filter((chunk) => chunk.key === null);

  return [...readable, ...unreadable].flatMap((chunk) => chunk.items).concat(trailing);
}
