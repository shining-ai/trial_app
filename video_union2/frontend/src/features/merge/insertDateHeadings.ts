import { placeDateHeadings } from "./placeDateHeadings";
import type { MergeItem } from "./types";

/**
 * 撮影日が変わる位置に日付の見出し(テキストの場面、表示時間1秒)を入れる。
 * 既にある日付の見出しは作り直さずにその位置へ移し(表示時間と id は保つ)、同じ日付の見出しは1つにまとめる。
 * 見出しは、その日の最初の動画の直前に続くテキストの場面のかたまりの前に入れる。読めない動画には付けない。
 */
export function insertDateHeadings(items: MergeItem[], nextId: () => string): MergeItem[] {
  return placeDateHeadings(items, nextId);
}
