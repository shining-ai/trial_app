export type MergeItem = {
  id: string;
  file_name: string;
  duration_seconds: number;
  width: number;
  height: number;
};

/** 動画の項目(今の MergeItem に kind を足したもの) */
export type VideoItem = MergeItem & { kind: "video" };

export type TextSceneItem = {
  kind: "text";
  /** 画面の中だけで使う(text-1, text-2 ...) */
  id: string;
  /** 正規化済み */
  text: string;
  /** 表示時間(0.1秒単位の整数) */
  durationTenths: number;
};

/** 結合リストの項目。既存の MergeItem(動画だけ)を使うコードを壊さないため別名にしている */
export type MergeListItem = VideoItem | TextSceneItem;

export type MergeJobStatus = "running" | "succeeded" | "failed";

export type MergeJobResponse = {
  id: string;
  status: MergeJobStatus;
  /** 0〜1 */
  progress: number;
  error: { code: string; message: string } | null;
};
