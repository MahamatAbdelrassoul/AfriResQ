const KEY = "afriresq-desk";

export function readDeskSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export function saveDeskSession(session) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearDeskSession() {
  sessionStorage.removeItem(KEY);
}

async function readBody(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The desk could not be opened.");
  return body;
}

export async function openDesk(placeId, code) {
  const res = await fetch("/api/desk/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placeId, code }),
  });
  return readBody(res);
}

export async function closeDesk(token) {
  if (!token) return;
  await fetch("/api/desk/session", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

export async function deskMe(token) {
  const res = await fetch("/api/desk/me", { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error(body.error || "Sign in to this desk first."), { signedOut: true });
  if (!res.ok) throw new Error(body.error || "The desk could not be reached.");
  return body;
}
