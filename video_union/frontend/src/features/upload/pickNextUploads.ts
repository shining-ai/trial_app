import type { UploadItem } from "./types";

export const MAX_CONCURRENT_UPLOADS = 2;

export function pickNextUploads(items: UploadItem[]): UploadItem[] {
  const uploadingCount = items.filter((item) => item.status === "uploading").length;
  const freeSlots = Math.max(0, MAX_CONCURRENT_UPLOADS - uploadingCount);
  return items.filter((item) => item.status === "pending").slice(0, freeSlots);
}
