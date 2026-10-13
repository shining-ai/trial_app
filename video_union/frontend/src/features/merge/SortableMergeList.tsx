import { DndContext, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collisionInsideList } from "./collisionInsideList";
import { dragAnnouncements } from "./dragAnnouncements";
import { dragEndToMove } from "./dragEndToMove";
import { suppressFirstSelfOver } from "./suppressFirstSelfOver";
import type { MergeItem } from "./types";
import { useDragSensors } from "./useDragSensors";

/**
 * 結合リストの ol を、センサー・一覧の外を当たりなしにする当たり判定・日本語の読み上げ付きで並べ替えられるようにする。
 * ドラッグ中にロック(入力欄が開く・結合が始まる)がかかったら、ドラッグを取り消す。
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
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [dragging, setDragging] = useState(false);
  const sensors = useDragSensors();
  const collisionDetection = useMemo(
    () => collisionInsideList(() => listRef.current?.getBoundingClientRect() ?? null),
    [],
  );
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  // 読み上げは最初の描画で一度だけ作り、そのときどきの一覧を参照する。
  // 「最初の自分自身の上」の記録を持つので、捨てられうる useMemo ではなく useState で保つ
  const [accessibility] = useState(() => {
    const current = () => dragAnnouncements(itemsRef.current);
    const announcements: Announcements = suppressFirstSelfOver({
      onDragStart: (args) => current().announcements.onDragStart(args),
      onDragOver: (args) => current().announcements.onDragOver(args),
      onDragEnd: (args) => current().announcements.onDragEnd(args),
      onDragCancel: (args) => current().announcements.onDragCancel(args),
    });
    // 読み上げの領域(role="status")は body の直下に出す。結合の区画の中に置くと、区画の status(結合ボタンの理由)と混ざるため
    return { announcements, screenReaderInstructions: current().screenReaderInstructions, container: document.body };
  });

  useEffect(() => {
    // dnd-kit には外からドラッグを取り消す手段がないため、どのセンサーも取り消しに使う Esc キーを送る。
    // キーボードでつかんだまま Tab で「結合する」や「編集」を押した場合などに、並べ替えずに終わらせる
    if (locked && dragging) {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
    }
  }, [locked, dragging]);

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
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol ref={listRef} aria-label="結合リスト" className={`merge-list${dragging ? " merge-list--dragging" : ""}`}>
          {children}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
