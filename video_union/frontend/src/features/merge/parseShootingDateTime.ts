const SHOOTING_DATETIME_PATTERN = /(\d{8})[_-](\d{6})/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** ファイル名から撮影日時(date: YYYYMMDD、key: YYYYMMDDhhmmss)を読む。読めないときは null。 */
export function parseShootingDateTime(fileName: string): { date: string; key: string } | null {
  const match = SHOOTING_DATETIME_PATTERN.exec(fileName);
  if (!match) return null;
  const [, date, time] = match;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2, 4));
  const second = Number(time.slice(4, 6));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { date, key: date + time };
}
