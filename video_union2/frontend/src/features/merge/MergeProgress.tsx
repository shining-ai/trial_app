import type { MergeJobResponse } from "./types";

const FAILED_MESSAGE = "結合に失敗しました";

export function MergeProgress({ job }: { job: MergeJobResponse | null }) {
  if (job?.status === "running") {
    return (
      <div className="merge-progress">
        <progress className="merge-progress__bar" value={job.progress} max={1} aria-label="結合の進み具合" />
        <span className="merge-progress__value">{`${Math.round(job.progress * 100)}%`}</span>
      </div>
    );
  }
  if (job?.status === "failed") {
    return (
      <p role="alert" className="message message--error">
        {job.error?.message ?? FAILED_MESSAGE}
      </p>
    );
  }
  return null;
}
