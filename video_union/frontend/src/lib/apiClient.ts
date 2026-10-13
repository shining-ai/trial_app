export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const FALLBACK_MESSAGE = "サーバーとの通信に失敗しました";

function readErrorBody(bodyText: string): { code: string; message: string } | null {
  try {
    const body: unknown = JSON.parse(bodyText);
    if (typeof body !== "object" || body === null || !("error" in body)) return null;
    const error = (body as { error: unknown }).error;
    if (typeof error !== "object" || error === null) return null;
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (typeof code !== "string" || typeof message !== "string") return null;
    return { code, message };
  } catch {
    return null;
  }
}

export function toApiError(status: number, bodyText: string): ApiError {
  const body = readErrorBody(bodyText);
  if (body === null) return new ApiError(status, "unknown", FALLBACK_MESSAGE);
  return new ApiError(status, body.code, body.message);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw toApiError(response.status, await response.text());
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
