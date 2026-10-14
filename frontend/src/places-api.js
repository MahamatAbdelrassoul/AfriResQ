export async function listPlaces(near) {
  const query = near ? `?lat=${near.lat}&lng=${near.lng}` : "";
  const res = await fetch(`/api/places${query}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The places could not be loaded.");
  return body;
}
