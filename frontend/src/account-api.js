export function studentHost(domain = "mak.ac.ug") {
  const host = String(domain || "").replace(/^@/, "").trim().toLowerCase();
  if (host.startsWith("students.")) return host;
  return `students.${host}`;
}

export function isStudentEmail(value, domain = "mak.ac.ug") {
  const email = String(value || "").trim();
  const host = studentHost(domain).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[^@\\s]+@${host}$`, "i").test(email);
}

export async function requestOtp(payload) {
  const res = await fetch("/api/auth/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The code could not be sent.");
  return body;
}

export async function verifyOtp(payload) {
  const res = await fetch("/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "That code could not be checked.");
  return body;
}

export async function loginWithPassword(payload) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Sign-in did not work.");
  return body;
}

export async function savePerson(user, profileDone, safety, token, password) {
  const res = await fetch("/api/people", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ user, profileDone, safety, ...(password ? { password } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The profile could not be saved.");
  return body;
}

export async function saveLastPlace(point, token) {
  const res = await fetch("/api/people/location", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(point),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The place could not be saved.");
  return body;
}

export async function findPerson({ phone, email }, token) {
  const params = new URLSearchParams();
  if (phone) params.set("phone", phone);
  if (email) params.set("email", email);
  const res = await fetch(`/api/people?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The profile could not be loaded.");
  return body;
}

function safetyHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function safetyMine(token) {
  const res = await fetch("/api/safety/mine", { headers: safetyHeaders(token) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The alerts could not be opened.");
  return body;
}

export async function startSafetyAlert(personId, token) {
  const res = await fetch("/api/safety/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...safetyHeaders(token) },
    body: JSON.stringify({ personId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The alert could not be started.");
  return body;
}

export async function answerSafetyAlert(id, token) {
  const res = await fetch(`/api/safety/alerts/${id}/answer`, {
    method: "POST",
    headers: safetyHeaders(token),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The answer could not be saved.");
  return body;
}

async function safetySend(path, method, token, payload) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...safetyHeaders(token) },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "That could not be saved.");
  return body;
}

export function startCheckin(seconds, token) {
  return safetySend("/api/safety/checkin", "POST", token, { seconds });
}

export function cancelCheckin(token) {
  return safetySend("/api/safety/checkin", "DELETE", token);
}

export function startTrip(seconds, dest, token, share) {
  return safetySend("/api/safety/trip", "POST", token, {
    seconds,
    destText: dest?.text || "",
    destLat: dest?.lat,
    destLng: dest?.lng,
    share: share === true,
  });
}

export function planWalk(body, token) {
  return safetySend("/api/safety/route", "POST", token, body);
}

export function endTrip(token) {
  return safetySend("/api/safety/trip", "DELETE", token);
}
