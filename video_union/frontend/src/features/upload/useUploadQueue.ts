import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/apiClient";
import { checkFileSize } from "./checkFileSize";
import { limitSelection, remainingSlots as countRemainingSlots } from "./limitSelection";
import { pickNextUploads } from "./pickNextUploads";
import type { UploadItem, VideoResponse } from "./types";
import { uploadVideo } from "./uploadVideo";

const TOO_LARGE_MESSAGE = "ファイルサイズが上限の4GBを超えています";
const UPLOAD_FAILED_MESSAGE = "アップロードに失敗しました";

export function useUploadQueue(options: { mergeCount: number; onUploaded: (video: VideoResponse) => void }) {
  const { mergeCount, onUploaded } = options;
  const [items, setItems] = useState<UploadItem[]>([]);
  const [limitExceeded, setLimitExceeded] = useState(false);
  const nextKey = useRef(0);
  const startedKeys = useRef(new Set<string>());
  const onUploadedRef = useRef(onUploaded);

  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  const updateItem = useCallback((key: string, changes: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }, []);

  useEffect(() => {
    const next = pickNextUploads(items).filter((item) => !startedKeys.current.has(item.key));
    if (next.length === 0) return;
    const nextKeys = new Set(next.map((item) => item.key));
    nextKeys.forEach((key) => startedKeys.current.add(key));
    setItems((current) =>
      current.map((item) => (nextKeys.has(item.key) ? { ...item, status: "uploading" } : item)),
    );
    for (const item of next) {
      uploadVideo(item.file, (fraction) => updateItem(item.key, { progress: fraction })).then(
        (video) => {
          updateItem(item.key, { status: "done", progress: 1, video });
          onUploadedRef.current(video);
        },
        (error: unknown) => {
          const message = error instanceof ApiError ? error.message : UPLOAD_FAILED_MESSAGE;
          updateItem(item.key, { status: "failed", errorMessage: message });
        },
      );
    }
  }, [items, updateItem]);

  const remainingSlots = countRemainingSlots({
    mergeCount,
    uploadingCount: items.filter((item) => item.status === "uploading").length,
    pendingCount: items.filter((item) => item.status === "pending").length,
  });

  const addFiles = useCallback(
    (files: File[]) => {
      const { accepted, discardedCount } = limitSelection(files.filter((file) => checkFileSize(file.size)), remainingSlots);
      const acceptedFiles = new Set(accepted);
      const added = files.flatMap((file): UploadItem[] => {
        const key = `upload-${nextKey.current++}`;
        if (!checkFileSize(file.size)) {
          return [{ key, file, status: "failed", progress: 0, errorMessage: TOO_LARGE_MESSAGE }];
        }
        if (acceptedFiles.has(file)) return [{ key, file, status: "pending", progress: 0 }];
        return [];
      });
      setLimitExceeded(discardedCount > 0);
      setItems((current) => [...current, ...added]);
    },
    [remainingSlots],
  );

  return { items, remainingSlots, limitExceeded, addFiles };
}
