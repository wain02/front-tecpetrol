const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

export function buildApiUrl(path: string, params?: Record<string, string>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    return new URL(`${normalizedPath}${query}`, apiBaseUrl).toString();
  }
  const normalizedBase = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  return `${normalizedBase}${normalizedPath}${query}`;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Error ${response.status} para ${url}`);
  return (await response.json()) as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Error ${response.status} para ${url}`);
  return (await response.json()) as T;
}
