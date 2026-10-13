export type NormalizedSceneText =
  | { ok: true; text: string; lineCount: number; charCount: number }
  | { ok: false; message: string };

const MAX_LINES = 5;
const MAX_LINE_CHARS = 20;
const MAX_TOTAL_CHARS = 100;
const MAX_REPORTED_CAUSES = 5;
const FORBIDDEN_CONTROL = /^[\p{Cc}\p{Cf}]$/u;
const EMOJI = /^(?:\p{Emoji_Presentation}|️)$/u;
// trim() は使わない(U+FEFF などまで取り除き、サーバーと取り除く文字が食い違うため)
const SURROUNDING_WHITESPACE = /^[ 　\n]+|[ 　\n]+$/g;

function controlName(char: string): string {
  if (char === "\t") return "タブ";
  if (char === "\r") return "復帰";
  return `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
}

function unsupported(causes: string[]): NormalizedSceneText {
  const shown = [...new Set(causes)].slice(0, MAX_REPORTED_CAUSES);
  return { ok: false, message: `表示できない文字が含まれています: ${shown.join(" ")}` };
}

function fail(message: string): NormalizedSceneText {
  return { ok: false, message };
}

/** サーバーの normalize_scene_text と同じ手順(フォントにない文字の判定を除く)で、テキストを正規化して確かめる。 */
export function normalizeSceneText(input: string): NormalizedSceneText {
  const normalized = input.replace(/\r\n/g, "\n").normalize("NFC");
  const chars = [...normalized];

  // 取り除く処理より前に確かめる(先頭・末尾のタブなども拒否するため)
  const forbidden = chars.filter((c) => c !== "\n" && FORBIDDEN_CONTROL.test(c));
  if (forbidden.length > 0) return unsupported(forbidden.map(controlName));

  const emoji = chars.filter((c) => EMOJI.test(c));
  if (emoji.length > 0) return unsupported(emoji);

  const text = normalized.replace(SURROUNDING_WHITESPACE, "");
  if (text === "") return fail("テキストを入力してください");

  const lines = text.split("\n");
  if (lines.length > MAX_LINES) return fail(`${MAX_LINES}行までです(${lines.length}行あります)`);

  const lengths = lines.map((line) => [...line].length);
  const tooLong = lengths.findIndex((length) => length > MAX_LINE_CHARS);
  if (tooLong >= 0) {
    return fail(`1行は${MAX_LINE_CHARS}文字までです(${tooLong + 1}行目が${lengths[tooLong]}文字)`);
  }

  const charCount = lengths.reduce((sum, length) => sum + length, 0);
  if (charCount > MAX_TOTAL_CHARS) {
    return fail(`全体で${MAX_TOTAL_CHARS}文字までです(${charCount}文字あります)`);
  }
  return { ok: true, text, lineCount: lines.length, charCount };
}
