// normalizeSceneText と同じ取り除き方(trim() は使わない)
const SURROUNDING_WHITESPACE = /^[ 　\n]+|[ 　\n]+$/g;

/** 入力中の表示用に、前後の空白・空行を除いた行数と、改行を除いた文字数(コードポイント数)を数える。上限は確かめない。 */
export function countSceneText(input: string): { lineCount: number; charCount: number } {
  const text = input.replace(/\r\n/g, "\n").normalize("NFC").replace(SURROUNDING_WHITESPACE, "");
  if (text === "") return { lineCount: 0, charCount: 0 };
  const lines = text.split("\n");
  return { lineCount: lines.length, charCount: lines.reduce((sum, line) => sum + [...line].length, 0) };
}
