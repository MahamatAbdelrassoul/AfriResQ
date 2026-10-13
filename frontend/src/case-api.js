async function readBody(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The case could not be saved.");
  return body;
}

export async function createCase(payload) {
  const res = await fetch("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readBody(res);
}

function deskHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getCase(id, token) {
  const res = await fetch(`/api/cases/${encodeURIComponent(id)}`, { headers: deskHeaders(token) });
  if (res.status === 404) return null;
  return readBody(res);
}

export async function listDeskCases(placeId, status, token) {
  const params = new URLSearchParams({ place: placeId });
  if (status) params.set("status", status);
  const res = await fetch(`/api/cases?${params}`, { headers: deskHeaders(token) });
  return readBody(res);
}

export async function updateCase(id, patch, token) {
  const res = await fetch(`/api/cases/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...deskHeaders(token) },
    body: JSON.stringify(patch),
  });
  return readBody(res);
}
