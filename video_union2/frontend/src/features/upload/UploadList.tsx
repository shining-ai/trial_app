import { formatDuration } from "../../lib/formatDuration";
import type { UploadItem } from "./types";

function UploadStatusText({ item }: { item: UploadItem }) {
  switch (item.status) {
    case "pending":
      return <span className="upload-list__status">待機中</span>;
    case "uploading":
      return <span className="upload-list__status">{`${Math.round(item.progress * 100)}%`}</span>;
    case "done":
      return (
        <span className="upload-list__status">
          {item.video
            ? `${formatDuration(item.video.duration_seconds)} / ${item.video.width}x${item.video.height}`
            : ""}
        </span>
      );
    case "failed":
      return (
        <span role="alert" className="upload-list__status upload-list__status--failed">
          {item.errorMessage}
        </span>
      );
  }
}

export function UploadList({ items }: { items: UploadItem[] }) {
  return (
    <ul aria-label="アップロードの状況" className="upload-list">
      {items.map((item) => (
        <li key={item.key} className="upload-list__item">
          <span className="upload-list__name">{item.file.name}</span> <UploadStatusText item={item} />
        </li>
      ))}
    </ul>
  );
}
