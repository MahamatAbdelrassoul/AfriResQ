// The website uses the Vite proxy, so these stay relative. The Android app calls the API directly.
export function apiUrl(path) {
  const base = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
