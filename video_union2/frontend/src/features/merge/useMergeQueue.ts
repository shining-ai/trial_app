import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../lib/apiClient";
import { deleteVideo } from "./deleteVideo";
import { moveItem, type MoveDirection } from "./moveItem";
import { sumDurationMilliseconds } from "./sumDurationMilliseconds";
import type { MergeItem } from "./types";

const DELETE_FAILED_MESSAGE = "削除に失敗しました";

export function useMergeQueue() {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 削除に失敗したとき元の位置に戻すため、最新の一覧を同期的に参照できるようにしておく
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const addItem = useCallback((item: MergeItem) => {
    setItems((current) => [...current, item]);
  }, []);

  const move = useCallback((index: number, direction: MoveDirection) => {
    setItems((current) => moveItem(current, index, direction));
  }, []);

  const removeItem = useCallback(async (id: string): Promise<string | null> => {
    // 削除の完了を待つあいだに結合を始めても、その動画が含まれないよう、先に一覧から外す
    const index = itemsRef.current.findIndex((item) => item.id === id);
    const removed = index < 0 ? null : { item: itemsRef.current[index], index };
    const remaining = itemsRef.current.filter((item) => item.id !== id);
    itemsRef.current = remaining;
    setItems(remaining);
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
    videoIds: items.map((item) => item.id),
    totalSeconds: sumDurationMilliseconds(items.map((item) => item.duration_seconds)) / 1000,
    deleteError,
    addItem,
    move,
    removeItem,
  };
}
