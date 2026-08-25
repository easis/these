import type { ApiError } from "@these/shared";

export class ApiRequestError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText })) as ApiError;
    throw new ApiRequestError(payload.error || "Request failed.", payload.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function query(parameters: Record<string, string | number | boolean | null | undefined>) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null && value !== "") values.set(key, String(value));
  }
  return values.toString();
}
