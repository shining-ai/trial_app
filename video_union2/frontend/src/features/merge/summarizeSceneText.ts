/** 一覧に出すテキストの1行目と、2行目以降があるか(「…」を付けるか)を返す。 */
export function summarizeSceneText(text: string): { firstLine: string; hasMore: boolean } {
  const [firstLine, ...rest] = text.split("\n");
  return { firstLine, hasMore: rest.length > 0 };
}
