export function studentHost(domain = "mak.ac.ug") {
  return `students.${domain}`;
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

export async function savePerson(user, profileDone, safety, token) {
  const res = await fetch("/api/people", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ user, profileDone, safety }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The profile could not be saved.");
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
