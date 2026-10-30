import { apiUrl } from "./api.js";

const KEY = "afriresq-partner";

export function readPartnerSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export function savePartnerSession(session) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearPartnerSession() {
  sessionStorage.removeItem(KEY);
}

export class PartnerSignedOut extends Error {}

async function call(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(apiUrl(`/api/partners${path}`), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) throw new PartnerSignedOut(data.error || "Sign in with the partner code first.");
  if (!res.ok) throw new Error(data.error || "AfriResQ could not be reached.");
  return data;
}

export function partnerSignIn(email, code) {
  return call("/session", { method: "POST", body: { email, code } });
}

export function partnerMe(token) {
  return call("/me", { token });
}

export function updatePartner(token, fields) {
  return call("/me", { method: "PATCH", body: fields, token });
}

export function signOutEverywhere(token) {
  return call("/sessions", { method: "DELETE", token });
}

export async function partnerSignOut(token) {
  if (!token) return;
  await call("/session", { method: "DELETE", token }).catch(() => {});
}
