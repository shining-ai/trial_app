import { ApiError, toApiError } from "../../lib/apiClient";
import type { VideoResponse } from "./types";

export function uploadVideo(file: File, onProgress: (fraction: number) => void): Promise<VideoResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status === 201) {
        resolve(JSON.parse(xhr.responseText) as VideoResponse);
      } else {
        reject(toApiError(xhr.status, xhr.responseText));
      }
    };
    xhr.onerror = () => {
      reject(new ApiError(0, "network_error", "サーバーに接続できませんでした"));
    };
    xhr.send(file);
  });
}
