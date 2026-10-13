export async function listPlaces() {
  const res = await fetch("/api/places");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The places could not be loaded.");
  return body;
}
