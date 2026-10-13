/** "20250804" を "2025年8月4日" にする(月・日は0で埋めない)。 */
export function formatDateHeading(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  return `${year}年${month}月${day}日`;
}
