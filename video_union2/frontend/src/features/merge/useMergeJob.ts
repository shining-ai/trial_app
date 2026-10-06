import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../lib/apiClient";
import { fetchMergeJob } from "./fetchMergeJob";
import { requestMerge } from "./requestMerge";
import type { MergeJobResponse } from "./types";

const POLL_INTERVAL_MS = 1000;
const START_FAILED_MESSAGE = "結合を始められませんでした";
const POLL_FAILED_MESSAGE = "結合の状況を取得できませんでした";

export function useMergeJob() {
  const [job, setJob] = useState<MergeJobResponse | null>(null);
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (job?.status !== "running") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const latest = await fetchMergeJob(job.id);
        if (!cancelled) setJob(latest);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : POLL_FAILED_MESSAGE;
        if (!cancelled) setJob({ ...job, status: "failed", error: { code: "poll_failed", message } });
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job]);

  const start = useCallback(async (videoIds: string[]) => {
    setRejectMessage(null);
    setIsRequesting(true);
    try {
      setJob(await requestMerge(videoIds));
    } catch (error) {
      setRejectMessage(error instanceof ApiError ? error.message : START_FAILED_MESSAGE);
    } finally {
      setIsRequesting(false);
    }
  }, []);

  return { job, isMerging: isRequesting || job?.status === "running", rejectMessage, start };
}
