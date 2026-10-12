import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

const ROLE = "listitem";
const ROLE_DESCRIPTION = "並べ替えできる項目";

/**
 * 結合リストの1行(li)を、そのままつかんで並べ替えられるようにする(FR-002)。
 * - マウス・タッチ: 行のどこからでもドラッグを始められる。マウスは4ピクセル動かすまで、タッチは長押しまで始まらないので、
 *   行の中のボタンは動かさずに押せばボタンとして働く
 * - キーボード: 行そのものにフォーカスしてスペースキーでつかむ。開始点を li にするので、dnd-kit のキーボードは li が
 *   操作の対象のときだけ始まり、行の中のボタンでスペースキーを押してもドラッグにならない
 * 役割は listitem のまま保ち、フォーカスしたときにどの行かわかる名前と、役割の説明(日本語)・操作の説明を付ける。
 */
export function SortableMergeItem(props: {
  id: string;
  /** 行の名前(フォーカスしたときの読み上げに使う) */
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
    attributes: { role: ROLE, roleDescription: ROLE_DESCRIPTION },
  });
  // ロック中は役割(listitem)だけにする。aria-disabled は付けない(行の中に開くテキストの場面の入力欄まで無効として
  // 扱われるため)。役割の説明・操作の説明・tabIndex も外し、つかめない行を「並べ替えできる」と案内せず Tab でも止まらない
  const { "aria-disabled": _ariaDisabled, ...dragAttributes } = attributes;
  const rowAttributes = locked ? { role: ROLE } : dragAttributes;

  return (
    <li
      // 開始点も li にする。指定しないと dnd-kit のキーボードは押された要素を確かめず、行の中のボタンのスペースキーでも始まる
      ref={(element) => {
        setNodeRef(element);
        setActivatorNodeRef(element);
      }}
      className={`${className}${locked ? "" : " merge-item--draggable"}${isDragging ? " merge-item--dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={name}
      {...rowAttributes}
      {...listeners}
    >
      {children}
    </li>
  );
}
