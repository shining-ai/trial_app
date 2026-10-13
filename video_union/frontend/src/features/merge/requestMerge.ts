import { apiFetch } from "../../lib/apiClient";
import { toMergeRequestItems } from "./toMergeRequestItems";
import type { MergeItem, MergeJobResponse } from "./types";

export function requestMerge(items: MergeItem[]): Promise<MergeJobResponse> {
  return apiFetch<MergeJobResponse>("/api/merges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: toMergeRequestItems(items) }),
  });
}
