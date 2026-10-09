import type { ReactNode } from "react";
import { formatDuration } from "../../lib/formatDuration";
import type { MoveDirection } from "./moveItem";
import { summarizeSceneText } from "./summarizeSceneText";
import { TextSceneEditor } from "./TextSceneEditor";
import type { MergeItem, TextSceneItem } from "./types";
import type { TextEditor } from "./useMergeQueue";

const MOVE_BUTTONS: { direction: MoveDirection; label: string }[] = [
  { direction: "up", label: "上へ" },
  { direction: "down", label: "下へ" },
  { direction: "top", label: "先頭へ" },
  { direction: "bottom", label: "末尾へ" },
];

const DEFAULT_DURATION = "3.0";

function formatTenths(durationTenths: number): string {
  return `${Math.floor(durationTenths / 10)}.${durationTenths % 10}`;
}

export function MergeOrderList(props: {
  items: MergeItem[];
  editor: TextEditor;
  editorError: string | null;
  /** 結合中 */
  disabled: boolean;
  deleteError: string | null;
  onMove: (index: number, direction: MoveDirection) => void;
  onRemove: (id: string) => void;
  onOpenInsert: (afterId: string | null) => void;
  onOpenEdit: (id: string) => void;
  onConfirmText: (text: string, durationTenths: number) => void;
  onCloseEditor: () => void;
}) {
  const { items, editor, editorError, disabled, deleteError, onMove, onRemove } = props;
  const { onOpenInsert, onOpenEdit, onConfirmText, onCloseEditor } = props;
  const lastIndex = items.length - 1;
  // 結合中と、入力欄が開いている間は、入力欄以外の操作をすべて止める(入力中に並びが変わらないようにする)
  const locked = disabled || editor !== null;
  // 挿入の直前の項目がなくなったときも、取り消せるよう入力欄を一覧の下に出す
  const insertTargetMissing =
    editor?.mode === "insert" && editor.afterId !== null && !items.some((item) => item.id === editor.afterId);

  function renderEditor(initial: { text: string; duration: string }) {
    return (
      <TextSceneEditor
        initialText={initial.text}
        initialDuration={initial.duration}
        error={editorError}
        onConfirm={onConfirmText}
        onCancel={onCloseEditor}
      />
    );
  }

  function renderMoveButtons(index: number, name: string): ReactNode {
    return MOVE_BUTTONS.map(({ direction, label }) => {
      const atEdge = direction === "up" || direction === "top" ? index === 0 : index === lastIndex;
      return (
        <button
          key={direction}
          type="button"
          aria-label={`${name} を${label}`}
          disabled={locked || atEdge}
          onClick={() => onMove(index, direction)}
        >
          {label}
        </button>
      );
    });
  }

  function renderInsertButton(item: MergeItem, name: string): ReactNode {
    return (
      <button type="button" aria-label={`${name} の後にテキストを挿入`} disabled={locked} onClick={() => onOpenInsert(item.id)}>
        この後にテキストを挿入
      </button>
    );
  }

  function renderTextScene(item: TextSceneItem, index: number): ReactNode {
    const { firstLine, hasMore } = summarizeSceneText(item.text);
    const name = `テキストの場面: ${firstLine}`;
    return (
      <>
        <span role="img" aria-label={name}>
          {`📝 ${firstLine}${hasMore ? "…" : ""}(${formatTenths(item.durationTenths)}秒)`}
        </span>{" "}
        {renderMoveButtons(index, name)}
        <button type="button" aria-label={`${name} を編集`} disabled={locked} onClick={() => onOpenEdit(item.id)}>
          編集
        </button>
        <button type="button" aria-label={`${name} を削除`} disabled={locked} onClick={() => onRemove(item.id)}>
          削除
        </button>{" "}
        {renderInsertButton(item, name)}
      </>
    );
  }

  function renderVideo(item: MergeItem & { kind: "video" }, index: number): ReactNode {
    return (
      <>
        <span>{item.file_name}</span>{" "}
        <span>{`${formatDuration(item.duration_seconds)} / ${item.width}x${item.height}`}</span>{" "}
        {renderMoveButtons(index, item.file_name)}
        <button
          type="button"
          aria-label={`${item.file_name} を削除`}
          disabled={locked}
          onClick={() => onRemove(item.id)}
        >
          削除
        </button>{" "}
        {renderInsertButton(item, item.file_name)}
      </>
    );
  }

  return (
    <div>
      <button type="button" disabled={locked} onClick={() => onOpenInsert(null)}>
        先頭にテキストを挿入
      </button>
      {editor?.mode === "insert" && editor.afterId === null
        ? renderEditor({ text: "", duration: DEFAULT_DURATION })
        : null}
      <ol aria-label="結合リスト">
        {items.map((item, index) => {
          const editing = editor?.mode === "edit" && editor.id === item.id && item.kind === "text";
          return (
            <li key={item.id}>
              {editing
                ? renderEditor({ text: item.text, duration: formatTenths(item.durationTenths) })
                : item.kind === "text"
                  ? renderTextScene(item, index)
                  : renderVideo(item, index)}
              {editor?.mode === "insert" && editor.afterId === item.id
                ? renderEditor({ text: "", duration: DEFAULT_DURATION })
                : null}
            </li>
          );
        })}
      </ol>
      {insertTargetMissing ? renderEditor({ text: "", duration: DEFAULT_DURATION }) : null}
      {deleteError ? <p role="alert">{deleteError}</p> : null}
    </div>
  );
}
