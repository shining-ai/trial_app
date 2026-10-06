import { apiFetch } from "../../lib/apiClient";
import type { MergeJobResponse } from "./types";

export function requestMerge(videoIds: string[]): Promise<MergeJobResponse> {
  return apiFetch<MergeJobResponse>("/api/merges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds }),
  });
}
