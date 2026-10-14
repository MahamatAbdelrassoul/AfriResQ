async function readBody(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The case could not be saved.");
  return body;
}

export async function createCase(payload, token) {
  const res = await fetch("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return readBody(res);
}

// A desk token or a person's sign-in token. The API works out which one it is.
function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getCase(id, token) {
  const res = await fetch(`/api/cases/${encodeURIComponent(id)}`, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  return readBody(res);
}

export async function listDeskCases(placeId, status, token) {
  const params = new URLSearchParams({ place: placeId });
  if (status) params.set("status", status);
  const res = await fetch(`/api/cases?${params}`, { headers: authHeaders(token) });
  return readBody(res);
}

export async function updateCase(id, patch, token) {
  const res = await fetch(`/api/cases/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(patch),
  });
  return readBody(res);
}
