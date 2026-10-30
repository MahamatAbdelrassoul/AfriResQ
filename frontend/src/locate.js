import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export function onDevice() {
  return Capacitor.isNativePlatform();
}

export function readFix() {
  if (onDevice()) return readNativeFix();
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

async function readNativeFix() {
  const perm = await Geolocation.requestPermissions();
  if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
    throw Object.assign(new Error("Location permission was denied."), { code: 1 });
  }
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 5000,
  });
  return fromPosition(pos);
}

export function watchFix(onFix) {
  if (onDevice()) return watchNativeFix(onFix);
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

function watchNativeFix(onFix) {
  let stop = false;
  let watchId = "";
  let last = 0;
  Geolocation.requestPermissions()
    .then((perm) => {
      if (stop || (perm.location !== "granted" && perm.coarseLocation !== "granted")) return "";
      return Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
        (pos, err) => {
          if (stop || err || !pos) return;
          const now = Date.now();
          if (now - last < 15000) return;
          last = now;
          onFix(fromPosition(pos));
        },
      );
    })
    .then((id) => {
      watchId = id || "";
      if (stop && watchId) Geolocation.clearWatch({ id: watchId });
    })
    .catch(() => {});
  return () => {
    stop = true;
    if (watchId) Geolocation.clearWatch({ id: watchId });
  };
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
