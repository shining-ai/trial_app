function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${twoDigits(minutes)}:${twoDigits(rest)}`;
  return `${minutes}:${twoDigits(rest)}`;
}
