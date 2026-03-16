const API_URL = import.meta.env.VITE_API_URL || "";

export function api(path: string, init?: RequestInit) {
  const url = `${API_URL}/api/mmm${path}`;
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}
