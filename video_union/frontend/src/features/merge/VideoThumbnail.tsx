import { useState } from "react";

/**
 * 結合リストの動画の行に出す、先頭のコマのサムネイル。読み込めなければ「画像なし」の枠を出す。
 * ファイル名がすぐ隣にあるので、画像は装飾として扱う(alt="")。
 */
export function VideoThumbnail({ videoId }: { videoId: string }) {
  // 失敗した動画のIDを覚え、別の動画に変わったら読み込み直す
  const [failedId, setFailedId] = useState<string | null>(null);

  if (failedId === videoId) {
    return <span className="video-thumbnail video-thumbnail--missing">画像なし</span>;
  }
  return (
    <img
      className="video-thumbnail"
      src={`/api/videos/${videoId}/thumbnail`}
      alt=""
      draggable={false}
      data-testid="video-thumbnail"
      onError={() => setFailedId(videoId)}
    />
  );
}
