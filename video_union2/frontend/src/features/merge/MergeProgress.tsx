import type { MergeJobResponse } from "./types";

export function MergeProgress({ job }: { job: MergeJobResponse | null }) {
  if (job?.status === "running") {
    return (
      <div>
        <progress value={job.progress} max={1} aria-label="結合の進み具合" />
        <span>{`${Math.round(job.progress * 100)}%`}</span>
      </div>
    );
  }
  if (job?.status === "failed") {
    return <p role="alert">{job.error?.message}</p>;
  }
  return null;
}
