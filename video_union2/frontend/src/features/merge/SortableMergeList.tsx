import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { collisionInsideList } from "./collisionInsideList";
import { dragAnnouncements } from "./dragAnnouncements";
import { dragEndToMove } from "./dragEndToMove";
import type { MergeItem } from "./types";
import { useDragSensors } from "./useDragSensors";

/**
 * 結合リストの ol を、センサー・一覧の外を当たりなしにする当たり判定・日本語の読み上げ付きで並べ替えられるようにする。
 * 離した時点でもロックを確かめ直す(ドラッグ中にロックがかかっても、dnd-kit は進行中のドラッグを止めないため)。
 */
export function SortableMergeList(props: {
  items: MergeItem[];
  locked: boolean;
  onMoveById: (activeId: string, overId: string) => void;
  children: ReactNode;
}) {
  const { items, locked, onMoveById, children } = props;
  const listRef = useRef<HTMLOListElement>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const [dragging, setDragging] = useState(false);
  const sensors = useDragSensors();
  const collisionDetection = useMemo(
    () => collisionInsideList(() => listRef.current?.getBoundingClientRect() ?? null),
    [],
  );
  // 読み上げの領域(role="status")は body の直下に出す。結合の区画の中に置くと、区画の status(結合ボタンの理由)と混ざるため
  const accessibility = useMemo(() => ({ ...dragAnnouncements(items), container: document.body }), [items]);

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDragging(false);
    const move = dragEndToMove(String(active.id), over ? String(over.id) : null, lockedRef.current);
    if (move) onMoveById(move.activeId, move.overId);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={accessibility}
      onDragStart={() => setDragging(true)}
      onDragCancel={() => setDragging(false)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ol ref={listRef} aria-label="結合リスト" className={`merge-list${dragging ? " merge-list--dragging" : ""}`}>
          {children}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
