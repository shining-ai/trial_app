import { formatDuration } from "../../lib/formatDuration";
import type { MoveDirection } from "./moveItem";
import type { MergeItem } from "./types";

const MOVE_BUTTONS: { direction: MoveDirection; label: string }[] = [
  { direction: "up", label: "上へ" },
  { direction: "down", label: "下へ" },
  { direction: "top", label: "先頭へ" },
  { direction: "bottom", label: "末尾へ" },
];

export function VideoOrderList(props: {
  items: MergeItem[];
  disabled: boolean;
  deleteError: string | null;
  onMove: (index: number, direction: MoveDirection) => void;
  onRemove: (id: string) => void;
}) {
  const { items, disabled, deleteError, onMove, onRemove } = props;
  const lastIndex = items.length - 1;

  return (
    <div>
      <ol aria-label="結合リスト">
        {items.map((item, index) => (
          <li key={item.id}>
            <span>{item.file_name}</span>{" "}
            <span>{`${formatDuration(item.duration_seconds)} / ${item.width}x${item.height}`}</span>{" "}
            {MOVE_BUTTONS.map(({ direction, label }) => {
              const atEdge =
                direction === "up" || direction === "top" ? index === 0 : index === lastIndex;
              return (
                <button
                  key={direction}
                  type="button"
                  aria-label={`${item.file_name} を${label}`}
                  disabled={disabled || atEdge}
                  onClick={() => onMove(index, direction)}
                >
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              aria-label={`${item.file_name} を削除`}
              disabled={disabled}
              onClick={() => onRemove(item.id)}
            >
              削除
            </button>
          </li>
        ))}
      </ol>
      {deleteError ? <p role="alert">{deleteError}</p> : null}
    </div>
  );
}
