import { apiFetch } from "../../lib/apiClient";

export async function deleteVideo(id: string): Promise<void> {
  await apiFetch<void>(`/api/videos/${id}`, { method: "DELETE" });
}
