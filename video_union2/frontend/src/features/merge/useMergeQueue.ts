import { useCallback, useState } from "react";
import { ApiError } from "../../lib/apiClient";
import { deleteVideo } from "./deleteVideo";
import { moveItem, type MoveDirection } from "./moveItem";
import type { MergeItem } from "./types";

const DELETE_FAILED_MESSAGE = "削除に失敗しました";

export function useMergeQueue() {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const addItem = useCallback((item: MergeItem) => {
    setItems((current) => [...current, item]);
  }, []);

  const move = useCallback((index: number, direction: MoveDirection) => {
    setItems((current) => moveItem(current, index, direction));
  }, []);

  const removeItem = useCallback(async (id: string): Promise<string | null> => {
    try {
      await deleteVideo(id);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : DELETE_FAILED_MESSAGE;
      setDeleteError(message);
      return message;
    }
    setItems((current) => current.filter((item) => item.id !== id));
    setDeleteError(null);
    return null;
  }, []);

  return {
    items,
    videoIds: items.map((item) => item.id),
    totalSeconds: items.reduce((sum, item) => sum + item.duration_seconds, 0),
    deleteError,
    addItem,
    move,
    removeItem,
  };
}
