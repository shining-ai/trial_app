import { formatDuration } from "../../lib/formatDuration";
import type { UploadItem } from "./types";

function UploadStatusText({ item }: { item: UploadItem }) {
  switch (item.status) {
    case "pending":
      return <span>待機中</span>;
    case "uploading":
      return <span>{`${Math.round(item.progress * 100)}%`}</span>;
    case "done":
      return (
        <span>
          {item.video
            ? `${formatDuration(item.video.duration_seconds)} / ${item.video.width}x${item.video.height}`
            : ""}
        </span>
      );
    case "failed":
      return <span role="alert">{item.errorMessage}</span>;
  }
}

export function UploadList({ items }: { items: UploadItem[] }) {
  return (
    <ul aria-label="アップロードの状況">
      {items.map((item) => (
        <li key={item.key}>
          <span>{item.file.name}</span> <UploadStatusText item={item} />
        </li>
      ))}
    </ul>
  );
}
