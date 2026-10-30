import { apiUrl } from "./api.js";

const KEY = "afriresq-admin";

export function readSession() {
  return sessionStorage.getItem(KEY) || "";
}

export function saveSession(token) {
  if (token) sessionStorage.setItem(KEY, token);
  else sessionStorage.removeItem(KEY);
}

export class SignedOut extends Error {}

// One door for every team-page call. A 401 means the session ended, so the page goes back to the gate.
export async function teamCall(token, path, { method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(apiUrl(`/api/admin${path}`), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) throw new SignedOut(data.error || "Sign in with the team code first.");
  if (!res.ok) throw Object.assign(new Error(data.error || "The team page could not reach AfriResQ."), { data });
  return data;
}

export function ago(value) {
  if (!value) return "";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

export function stateClass(state) {
  if (state === "sent") return "warn";
  if (state === "declined") return "warn";
  if (state === "closed" || state === "cancelled") return "";
  return "ok";
}

export const STATE_OPTIONS = [
  ["sent", "Sent"],
  ["accepted", "Accepted"],
  ["on_the_way", "On the way"],
  ["arrived", "Arrived"],
  ["closed", "Closed"],
  ["cancelled", "Cancelled"],
  ["declined", "Declined"],
];

export const KIND_LABEL = {
  hospital: "Hospital",
  police: "Police",
  fire: "Fire",
  disaster: "Disaster",
};
