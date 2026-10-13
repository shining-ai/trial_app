import { describe, expect, test } from "vitest";
import { parseSceneDuration } from "../../../../src/features/merge/parseSceneDuration";

const MESSAGE = "表示時間は1秒から60秒までで、小数第1位まで指定してください";

describe("parseSceneDuration", () => {
  test.each([
    ["1", 10],
    ["1.0", 10],
    ["5.5", 55],
    ["3", 30],
    ["60", 600],
    ["60.0", 600],
    ["59.9", 599],
    ["01", 10],
    [" 3 ", 30],
  ])("%j は %i(0.1秒単位)", (input, tenths) => {
    expect(parseSceneDuration(input)).toEqual({ ok: true, tenths });
  });

  test.each([
    ["0.9", "1秒未満"],
    ["0", "0"],
    ["60.1", "60秒超"],
    ["61", "61"],
    ["5.55", "小数第2位"],
    ["abc", "数字でない"],
    ["", "空"],
    ["   ", "空白だけ"],
    ["1e1", "指数表記"],
    ["-1", "負"],
    ["５", "全角数字"],
    ["5.", "小数点だけ"],
    [".5", "整数部なし"],
    ["100", "3桁"],
    ["1,5", "カンマ"],
  ])("%j は範囲外・形式不正として拒否する(%s)", (input) => {
    expect(parseSceneDuration(input)).toEqual({ ok: false, message: MESSAGE });
  });
});
