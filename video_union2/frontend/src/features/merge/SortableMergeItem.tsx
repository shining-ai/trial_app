import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

const ROLE_DESCRIPTION = "並べ替えできる項目";

/**
 * 結合リストの1行(li)を、そのままつかんで並べ替えられるようにする(FR-002)。
 * - マウス・タッチ: 行のどこからでもドラッグを始められる。マウスは4ピクセル動かすまで、タッチは長押しまで始まらないので、
 *   行の中のボタンは動かさずに押せばボタンとして働く
 * - キーボード: 行そのものにフォーカスしてスペースキーでつかむ。dnd-kit のキーボードは開始点(この li)が操作の対象のときだけ
 *   始まるので、行の中のボタンでスペースキーを押してもドラッグにならない
 * 役割は listitem のまま保ち、読み上げ用に役割の説明(日本語)と操作の説明を付ける。
 */
export function SortableMergeItem(props: {
  id: string;
  /** 入力欄が開いている間・結合中 */
  locked: boolean;
  className: string;
  children: ReactNode;
}) {
  const { id, locked, className, children } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: locked,
    attributes: { role: "listitem", roleDescription: ROLE_DESCRIPTION },
  });

  // aria-disabled は付けない。行の中に開くテキストの場面の入力欄まで「無効」として扱われてしまうため。
  // ロック中は Tab で止まらないようにして、つかめないことを表す
  const { "aria-disabled": _ariaDisabled, tabIndex, ...rowAttributes } = attributes;

  return (
    <li
      // 開始点も li にする。指定しないと dnd-kit のキーボードは押された要素を確かめず、行の中のボタンのスペースキーでも始まる
      ref={(element) => {
        setNodeRef(element);
        setActivatorNodeRef(element);
      }}
      className={`${className}${locked ? "" : " merge-item--draggable"}${isDragging ? " merge-item--dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...rowAttributes}
      tabIndex={locked ? undefined : tabIndex}
      {...listeners}
    >
      {children}
    </li>
  );
}
