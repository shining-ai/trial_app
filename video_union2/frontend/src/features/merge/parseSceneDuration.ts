export type ParsedSceneDuration = { ok: true; tenths: number } | { ok: false; message: string };

const MIN_TENTHS = 10;
const MAX_TENTHS = 600;
const MESSAGE = "表示時間は1秒から60秒までで、小数第1位まで指定してください";
const FORMAT = /^(\d{1,2})(?:\.(\d))?$/;

/** 表示時間の欄の文字列を0.1秒単位の整数にする。浮動小数を経由せず、整数部と小数第1位から数える。 */
export function parseSceneDuration(input: string): ParsedSceneDuration {
  const match = FORMAT.exec(input.replace(/^ +| +$/g, ""));
  if (!match) return { ok: false, message: MESSAGE };
  const tenths = Number(match[1]) * 10 + Number(match[2] ?? "0");
  if (tenths < MIN_TENTHS || tenths > MAX_TENTHS) return { ok: false, message: MESSAGE };
  return { ok: true, tenths };
}
