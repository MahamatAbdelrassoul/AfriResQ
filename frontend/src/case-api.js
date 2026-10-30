import { apiUrl } from "./api.js";

// retry means the phone should keep the alert and try again. A refused request will not succeed later.
export class CaseSendError extends Error {
  constructor(message, retry) {
    super(message);
    this.retry = retry;
  }
}

function sendError(res, body) {
  const message = body.error || "The case could not be saved.";
  const retry = res.status === 502 || res.status === 503 || res.status === 504 || res.status >= 500;
  return new CaseSendError(message, retry && res.status !== 400 && res.status !== 401 && res.status !== 403 && res.status !== 409);
}

async function readBody(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw sendError(res, body);
  return body;
}

async function postCase(payload, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(apiUrl("/api/cases"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    throw new CaseSendError("The network did not answer. The request is saved on this phone.", true);
  } finally {
    clearTimeout(timer);
  }
}

export async function createCase(payload, token) {
  const res = await postCase(payload, token);
  return readBody(res);
}

// A desk token or a person's sign-in token. The API works out which one it is.
function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getCase(id, token) {
  const res = await fetch(apiUrl(`/api/cases/${encodeURIComponent(id)}`), { headers: authHeaders(token) });
  if (res.status === 404) return null;
  return readBody(res);
}

export async function listDeskCases(placeId, status, token) {
  const params = new URLSearchParams({ place: placeId });
  if (status) params.set("status", status);
  const res = await fetch(apiUrl(`/api/cases?${params}`), { headers: authHeaders(token) });
  return readBody(res);
}

export async function updateCase(id, patch, token) {
  const res = await fetch(apiUrl(`/api/cases/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(patch),
  });
  return readBody(res);
}

// The signed-in person's own cases, newest first.
export async function listMyCases(phone, token) {
  const params = new URLSearchParams({ phone: String(phone || "").replace(/\D/g, "") });
  const res = await fetch(apiUrl(`/api/cases?${params}`), { headers: authHeaders(token) });
  return readBody(res);
}
