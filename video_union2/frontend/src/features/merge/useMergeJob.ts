import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../lib/apiClient";
import { fetchMergeJob } from "./fetchMergeJob";
import { requestMerge } from "./requestMerge";
import type { MergeItem, MergeJobResponse } from "./types";

const POLL_INTERVAL_MS = 1000;
const START_FAILED_MESSAGE = "結合を始められませんでした";

export function useMergeJob() {
  const [job, setJob] = useState<MergeJobResponse | null>(null);
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  // 一時的な失敗のあとも、同じジョブの問い合わせをもう一度予約するための合図
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (job?.status !== "running") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const latest = await fetchMergeJob(job.id);
        if (!cancelled) setJob(latest);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setJob({ ...job, status: "failed", error: { code: error.code, message: error.message } });
        } else {
          setRetryCount((count) => count + 1);
        }
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job, retryCount]);

  const start = useCallback(async (items: MergeItem[]) => {
    setRejectMessage(null);
    setIsRequesting(true);
    try {
      setJob(await requestMerge(items));
    } catch (error) {
      setRejectMessage(error instanceof ApiError ? error.message : START_FAILED_MESSAGE);
    } finally {
      setIsRequesting(false);
    }
  }, []);

  return { job, isMerging: isRequesting || job?.status === "running", rejectMessage, start };
}
