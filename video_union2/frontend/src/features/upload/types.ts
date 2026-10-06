export type VideoResponse = {
  id: string;
  file_name: string;
  duration_seconds: number;
  width: number;
  height: number;
};

export type UploadStatus = "pending" | "uploading" | "done" | "failed";

export type UploadItem = {
  key: string;
  file: File;
  status: UploadStatus;
  /** 0〜1 */
  progress: number;
  video?: VideoResponse;
  errorMessage?: string;
};
