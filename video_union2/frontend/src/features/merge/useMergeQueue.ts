import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../lib/apiClient";
import { countVideoItems } from "./countVideoItems";
import { deleteVideo } from "./deleteVideo";
import { insertItemAfter } from "./insertItemAfter";
import { moveItem, type MoveDirection } from "./moveItem";
import { replaceItem } from "./replaceItem";
import { sumMergeItemsMilliseconds } from "./sumMergeItemsMilliseconds";
import type { MergeItem, TextSceneItem, VideoItem } from "./types";

const DELETE_FAILED_MESSAGE = "削除に失敗しました";
const INSERT_TARGET_GONE_MESSAGE = "挿入する位置の項目がなくなりました。取り消して、もう一度挿入してください";

/** 入力欄の状態。挿入の位置は直前の項目の id で持つ(先頭は null)。 */
export type TextEditor = { mode: "insert"; afterId: string | null } | { mode: "edit"; id: string } | null;

export function useMergeQueue() {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [editor, setEditor] = useState<TextEditor>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  // 削除に失敗したとき元の位置に戻すため、最新の一覧を同期的に参照できるようにしておく
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const textSceneCount = useRef(0);

  const addItem = useCallback((item: VideoItem) => {
    setItems((current) => [...current, item]);
  }, []);

  const move = useCallback((index: number, direction: MoveDirection) => {
    if (editorRef.current) return;
    setItems((current) => moveItem(current, index, direction));
  }, []);

  const openInsert = useCallback((afterId: string | null) => {
    setEditorError(null);
    editorRef.current = { mode: "insert", afterId };
    setEditor(editorRef.current);
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditorError(null);
    editorRef.current = { mode: "edit", id };
    setEditor(editorRef.current);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorError(null);
    editorRef.current = null;
    setEditor(null);
  }, []);

  const confirmText = useCallback((text: string, durationTenths: number) => {
    const current = editorRef.current;
    if (!current) return;
    if (current.mode === "edit") {
      const edited: TextSceneItem = { kind: "text", id: current.id, text, durationTenths };
      const next = replaceItem(itemsRef.current, current.id, edited);
      itemsRef.current = next;
      setItems(next);
    } else {
      const inserted: TextSceneItem = {
        kind: "text",
        id: `text-${textSceneCount.current + 1}`,
        text,
        durationTenths,
      };
      const next = insertItemAfter(itemsRef.current, current.afterId, inserted);
      if (!next) {
        setEditorError(INSERT_TARGET_GONE_MESSAGE);
        return;
      }
      textSceneCount.current += 1;
      itemsRef.current = next;
      setItems(next);
    }
    setEditorError(null);
    editorRef.current = null;
    setEditor(null);
  }, []);

  const removeItem = useCallback(async (id: string): Promise<string | null> => {
    if (editorRef.current) return null;
    // 削除の完了を待つあいだに結合を始めても、その動画が含まれないよう、先に一覧から外す
    const index = itemsRef.current.findIndex((item) => item.id === id);
    const removed = index < 0 ? null : { item: itemsRef.current[index], index };
    const remaining = itemsRef.current.filter((item) => item.id !== id);
    itemsRef.current = remaining;
    setItems(remaining);
    // テキストの場面はサーバーに保存していないので、一覧から外すだけでよい
    if (removed?.item.kind === "text") return null;
    try {
      await deleteVideo(id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === "video_not_found") {
        setDeleteError(null);
        return null;
      }
      if (removed) {
        setItems((current) => [...current.slice(0, removed.index), removed.item, ...current.slice(removed.index)]);
      }
      const message = error instanceof ApiError ? error.message : DELETE_FAILED_MESSAGE;
      setDeleteError(message);
      return message;
    }
    setDeleteError(null);
    return null;
  }, []);

  return {
    items,
    editor,
    videoCount: countVideoItems(items),
    totalSeconds: sumMergeItemsMilliseconds(items) / 1000,
    deleteError,
    editorError,
    addItem,
    move,
    removeItem,
    openInsert,
    openEdit,
    closeEditor,
    confirmText,
  };
}
