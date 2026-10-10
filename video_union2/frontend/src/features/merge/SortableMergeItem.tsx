import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

const ROLE_DESCRIPTION = "並べ替えできる項目";

/**
 * 結合リストの1行(li)を並べ替えられるようにし、左端につまみを置いて中身を描く。
 * dnd-kit の属性と操作の受け口はつまみにだけ付け、行の中のボタンや文字からはドラッグを始めない(FR-002)。
 */
export function SortableMergeItem(props: {
  id: string;
  /** 行の名前(つまみの読み上げ名に使う) */
  name: string;
  /** 入力欄が開いている間・結合中 */
  locked: boolean;
  className: string;
  children: ReactNode;
}) {
  const { id, name, locked, className, children } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: locked,
    attributes: { roleDescription: ROLE_DESCRIPTION },
  });

  return (
    <li
      ref={setNodeRef}
      className={`${className}${isDragging ? " merge-item--dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="drag-handle"
        aria-label={`${name} をドラッグして並べ替え`}
        disabled={locked}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      {children}
    </li>
  );
}
