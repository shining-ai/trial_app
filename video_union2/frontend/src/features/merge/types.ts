export type MergeItem = {
  id: string;
  file_name: string;
  duration_seconds: number;
  width: number;
  height: number;
};

export type MergeJobStatus = "running" | "succeeded" | "failed";

export type MergeJobResponse = {
  id: string;
  status: MergeJobStatus;
  /** 0〜1 */
  progress: number;
  error: { code: string; message: string } | null;
};
