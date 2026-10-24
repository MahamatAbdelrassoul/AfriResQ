import { useSyncExternalStore } from "react";

const KEY = "afriresq-photo";

function read() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

let photo = read();
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProfilePhoto() {
  return useSyncExternalStore(subscribe, () => photo, () => "");
}

export function saveProfilePhoto(next) {
  photo = next || "";
  try {
    if (photo) localStorage.setItem(KEY, photo);
    else localStorage.removeItem(KEY);
  } catch {
    /* this visit still shows the picture */
  }
  listeners.forEach((listener) => listener());
}
