export const API_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

const API_KEY =
  process.env.NEXT_PUBLIC_MODELDOCK_API_KEY ?? "";

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (API_KEY) {
    headers.set("Authorization", `Bearer ${API_KEY}`);
  }

  return fetch(buildApiUrl(path), {
    ...options,
    headers,
  });
}

export function buildApiUrl(path: string): string {
  return `${API_URL}/${path.replace(/^\/+/, "")}`;
}
