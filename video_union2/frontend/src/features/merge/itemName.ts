import { summarizeSceneText } from "./summarizeSceneText";
import type { MergeItem } from "./types";

/** 結合リストの行の名前(動画はファイル名、テキストの場面は「テキストの場面: {1行目}」)を返す。 */
export function itemName(item: MergeItem): string {
  if (item.kind === "video") return item.file_name;
  return `テキストの場面: ${summarizeSceneText(item.text).firstLine}`;
}
