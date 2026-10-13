export const MAX_VIDEOS = 100;

export type SlotUsage = {
  mergeCount: number;
  uploadingCount: number;
  pendingCount: number;
};

export function remainingSlots(usage: SlotUsage): number {
  const used = usage.mergeCount + usage.uploadingCount + usage.pendingCount;
  return Math.max(0, MAX_VIDEOS - used);
}

export function limitSelection<T>(files: T[], remaining: number): { accepted: T[]; discardedCount: number } {
  const allowed = Math.max(0, remaining);
  const accepted = files.slice(0, allowed);
  return { accepted, discardedCount: files.length - accepted.length };
}
