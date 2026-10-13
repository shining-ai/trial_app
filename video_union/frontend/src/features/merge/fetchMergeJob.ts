import { apiFetch } from "../../lib/apiClient";
import type { MergeJobResponse } from "./types";

export function fetchMergeJob(jobId: string): Promise<MergeJobResponse> {
  return apiFetch<MergeJobResponse>(`/api/merges/${jobId}`);
}
