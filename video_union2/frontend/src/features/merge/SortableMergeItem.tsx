import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

const ROLE_DESCRIPTION = "並べ替えできる項目";

/**
 * 結合リストの1行(li)を並べ替えられるようにし、左端につまみを置いて中身を描く(FR-002)。
 * - マウス・タッチ: 操作の受け口(listeners)を li に付け、行のどこからでもドラッグを始められる。
 *   マウスは4ピクセル動かすまで、タッチは長押しまで始まらないので、行の中のボタンは動かさずに押せばボタンとして働く
 * - キーボード: 開始点(setActivatorNodeRef)と読み上げ用の属性はつまみに付ける。dnd-kit のキーボードは開始点からしか
 *   始まらないので、行の中のボタンでスペースキーを押してもドラッグにならない
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
      className={`${className}${locked ? "" : " merge-item--draggable"}${isDragging ? " merge-item--dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="drag-handle"
        aria-label={`${name} をドラッグして並べ替え`}
        disabled={locked}
        {...attributes}
      >
        ⋮⋮
      </button>
      {children}
    </li>
  );
}
