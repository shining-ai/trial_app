import { describe, expect, test } from "vitest";
import { normalizeSceneText } from "../../../../src/features/merge/normalizeSceneText";

const fail = (message: string) => ({ ok: false, message });
const unsupported = (chars: string) => fail(`表示できない文字が含まれています: ${chars}`);
const ok = (text: string, lineCount: number, charCount: number) => ({ ok: true, text, lineCount, charCount });

describe("normalizeSceneText: 正規化と数え方", () => {
  test("1行と複数行を行数・文字数つきで受け付ける", () => {
    expect(normalizeSceneText("京都")).toEqual(ok("京都", 1, 2));
    expect(normalizeSceneText("2026年10月9日\n京都 嵐山")).toEqual(ok("2026年10月9日\n京都 嵐山", 2, 15));
  });

  test("CRLF は改行として扱い、\\n でつないだ文字列にする", () => {
    expect(normalizeSceneText("京都\r\n嵐山")).toEqual(ok("京都\n嵐山", 2, 4));
  });

  test("前後の半角空白・全角空白・空行を取り除く", () => {
    expect(normalizeSceneText("\n　京都 \n\n")).toEqual(ok("京都", 1, 2));
    expect(normalizeSceneText("  京都\n嵐山　")).toEqual(ok("京都\n嵐山", 2, 4));
  });

  test("途中の空行と行末の空白は残す(空行も行に数える)", () => {
    expect(normalizeSceneText("京都\n\n嵐山")).toEqual(ok("京都\n\n嵐山", 3, 4));
    expect(normalizeSceneText("京都 \n嵐山")).toEqual(ok("京都 \n嵐山", 2, 5));
  });

  test("NFD の濁点つきかなは NFC にまとめて1文字と数える", () => {
    const nfd = "が";
    expect(normalizeSceneText(nfd.repeat(20))).toEqual(ok("が".repeat(20), 1, 20));
    expect(normalizeSceneText(nfd.repeat(21))).toEqual(fail("1行は20文字までです(1行目が21文字)"));
  });

  test("サロゲートペアの文字は1文字と数える", () => {
    expect(normalizeSceneText("𠮷".repeat(20))).toEqual(ok("𠮷".repeat(20), 1, 20));
    expect(normalizeSceneText("𠮷".repeat(21))).toEqual(fail("1行は20文字までです(1行目が21文字)"));
  });
});

describe("normalizeSceneText: 空", () => {
  test("空・空白だけ・改行だけは拒否する", () => {
    const expected = fail("テキストを入力してください");
    expect(normalizeSceneText("")).toEqual(expected);
    expect(normalizeSceneText("  　 ")).toEqual(expected);
    expect(normalizeSceneText("\n\n")).toEqual(expected);
    expect(normalizeSceneText(" \n　\r\n ")).toEqual(expected);
  });
});

describe("normalizeSceneText: 制御・書式文字", () => {
  test("タブ・制御文字・書式文字・復帰を名前つきで拒否する", () => {
    expect(normalizeSceneText("京\t都")).toEqual(unsupported("タブ"));
    expect(normalizeSceneText("京\u0007都")).toEqual(unsupported("U+0007"));
    expect(normalizeSceneText("京​都")).toEqual(unsupported("U+200B"));
    expect(normalizeSceneText("京‮都")).toEqual(unsupported("U+202E"));
    expect(normalizeSceneText("京\r都")).toEqual(unsupported("復帰"));
  });

  test("先頭・末尾のタブは取り除かれずに拒否される", () => {
    expect(normalizeSceneText("\t京都")).toEqual(unsupported("タブ"));
    expect(normalizeSceneText("京都\t")).toEqual(unsupported("タブ"));
    expect(normalizeSceneText("\t")).toEqual(unsupported("タブ"));
  });

  test("先頭の U+FEFF と末尾の U+0085 は取り除かれずに拒否される", () => {
    expect(normalizeSceneText("﻿京都")).toEqual(unsupported("U+FEFF"));
    expect(normalizeSceneText("京都\u0085")).toEqual(unsupported("U+0085"));
  });

  test("原因は出てきた順に重複を除いて最大5つまで示す", () => {
    expect(normalizeSceneText("\t\u0007\t​\u0007")).toEqual(unsupported("タブ U+0007 U+200B"));
    expect(normalizeSceneText("\u0001\u0002\u0003\u0004\u0005\u0006\u0007")).toEqual(
      unsupported("U+0001 U+0002 U+0003 U+0004 U+0005"),
    );
  });

  test("制御文字は絵文字より先に報告する", () => {
    expect(normalizeSceneText("😀\t")).toEqual(unsupported("タブ"));
  });
});

describe("normalizeSceneText: 絵文字", () => {
  test("絵文字を拒否して、その文字をそのまま示す", () => {
    expect(normalizeSceneText("京都😀")).toEqual(unsupported("😀"));
  });

  test("絵文字の表示を選ぶ U+FE0F を伴う文字(❤️)も拒否する", () => {
    expect(normalizeSceneText("❤️")).toEqual(unsupported("️"));
  });

  test("絵文字は出てきた順に重複を除いて最大5つまで示す", () => {
    expect(normalizeSceneText("😀京😀都😁")).toEqual(unsupported("😀 😁"));
    expect(normalizeSceneText("😀😁😂😃😄😅😆")).toEqual(unsupported("😀 😁 😂 😃 😄"));
  });

  test("© と ™ のように文字として表示されるものは拒否しない", () => {
    expect(normalizeSceneText("©2026")).toEqual(ok("©2026", 1, 5));
    expect(normalizeSceneText("™")).toEqual(ok("™", 1, 1));
  });

  test("絵文字の拒否は行数・文字数の上限の確認より先に行う", () => {
    expect(normalizeSceneText("😀\n京\n都\n嵐\n山\n年")).toEqual(unsupported("😀"));
    expect(normalizeSceneText(`${"京".repeat(21)}😀`)).toEqual(unsupported("😀"));
  });
});

describe("normalizeSceneText: 行数と文字数の境界", () => {
  test("5行は受け付け、6行は拒否する", () => {
    expect(normalizeSceneText("京\n都\n嵐\n山\n年")).toEqual(ok("京\n都\n嵐\n山\n年", 5, 5));
    expect(normalizeSceneText("京\n都\n嵐\n山\n年\n月")).toEqual(fail("5行までです(6行あります)"));
  });

  test("途中の空行も行数に数える", () => {
    expect(normalizeSceneText("京\n\n都\n\n嵐\n\n山")).toEqual(fail("5行までです(7行あります)"));
  });

  test("20文字の行は受け付け、21文字の行は行番号つきで拒否する", () => {
    expect(normalizeSceneText("京".repeat(20))).toEqual(ok("京".repeat(20), 1, 20));
    expect(normalizeSceneText("京".repeat(21))).toEqual(fail("1行は20文字までです(1行目が21文字)"));
    expect(normalizeSceneText(`京都\n嵐山\n${"京".repeat(23)}\n${"京".repeat(25)}`)).toEqual(
      fail("1行は20文字までです(3行目が23文字)"),
    );
    expect(normalizeSceneText(`京都\n${"京".repeat(21)}`)).toEqual(fail("1行は20文字までです(2行目が21文字)"));
  });

  test("5行 × 20文字(100文字)は受け付ける", () => {
    const text = Array(5).fill("京".repeat(20)).join("\n");
    expect(normalizeSceneText(text)).toEqual(ok(text, 5, 100));
  });
});
