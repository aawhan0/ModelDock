export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  const base = API_URL.replace(/\\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
