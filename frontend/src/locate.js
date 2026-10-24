export function readFix() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error("This browser cannot read a location."), { code: 0 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(fromPosition(pos)),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  });
}

export function watchFix(onFix) {
  if (!navigator.geolocation) return () => {};
  let last = 0;
  const id = navigator.geolocation.watchPosition((pos) => {
    const now = Date.now();
    if (now - last < 15000) return;
    last = now;
    onFix(fromPosition(pos));
  }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  return () => navigator.geolocation.clearWatch(id);
}

function fromPosition(pos) {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Math.max(1, Math.round(pos.coords.accuracy || 0)),
  };
}

export function pinFrom(fix, fallback) {
  if (fix?.status === "ready") return [fix.lat, fix.lng];
  if (!fix || fix.status === "wait") return null;
  return fallback;
}
