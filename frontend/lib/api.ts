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
    cache: options.cache ?? "no-store",
    headers,
  });
}

export function buildApiUrl(path: string): string {
  const base = API_URL.replace(/\\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}


export async function getApiErrorMessage(
  response: Response,
  fallback = 'Request failed',
): Promise<string> {
  try {
    const body = (await response.clone().json()) as {
      detail?: string | { msg?: string }[];
      message?: string;
    };

    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail;
    }

    if (Array.isArray(body.detail)) {
      const message = body.detail
        .map((item) => item?.msg)
        .filter(Boolean)
        .join('; ');
      if (message) return message;
    }

    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }
  } catch {
    // Fall through to the HTTP status fallback.
  }

  return response.status
    ? `${fallback} (HTTP ${response.status})`
    : fallback;
}
