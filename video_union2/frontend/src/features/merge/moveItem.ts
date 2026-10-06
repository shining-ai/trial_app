export type MoveDirection = "up" | "down" | "top" | "bottom";

function targetIndex(index: number, length: number, direction: MoveDirection): number {
  switch (direction) {
    case "up":
      return Math.max(0, index - 1);
    case "down":
      return Math.min(length - 1, index + 1);
    case "top":
      return 0;
    case "bottom":
      return length - 1;
  }
}

export function moveItem<T>(items: T[], index: number, direction: MoveDirection): T[] {
  const result = [...items];
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return result;
  const [moved] = result.splice(index, 1);
  result.splice(targetIndex(index, items.length, direction), 0, moved);
  return result;
}
