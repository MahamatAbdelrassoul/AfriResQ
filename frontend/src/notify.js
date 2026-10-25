const SEEN_KEY = "afriresq-notes";
const CHOICE_KEY = "afriresq-notify";
const LATER_KEY = "afriresq-notify-later";

export function notifySupported() {
  return typeof Notification !== "undefined";
}

export function notifyPermission() {
  if (!notifySupported()) return "unsupported";
  return Notification.permission;
}

function readChoice() {
  try {
    const saved = localStorage.getItem(CHOICE_KEY);
    if (saved === "on" || saved === "off") return saved;
    if (localStorage.getItem(LATER_KEY) === "1") return "off";
  } catch { /* treat it as not chosen yet */ }
  if (notifyPermission() === "granted") return "on";
  return "";
}

export function notifyDecided() {
  return readChoice() !== "";
}

export function notifyEnabled() {
  return readChoice() === "on" && notifyPermission() === "granted";
}

function remember(choice) {
  try {
    localStorage.setItem(CHOICE_KEY, choice);
    if (choice === "on") localStorage.removeItem(LATER_KEY);
    else localStorage.setItem(LATER_KEY, "1");
  } catch { /* the switch still updates for this visit */ }
  window.dispatchEvent(new CustomEvent("afriresq-notify"));
}

export async function registerNotifier() {
  if (!("serviceWorker" in navigator) || !notifyEnabled()) return null;
  try {
    return await navigator.serviceWorker.register("/notify-sw.js");
  } catch {
    return null;
  }
}

export async function setNotifyChoice(on) {
  if (!notifySupported()) return "unsupported";
  if (!on) {
    remember("off");
    return "off";
  }
  let permission = notifyPermission();
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    remember("off");
    return permission === "denied" ? "denied" : "off";
  }
  remember("on");
  await registerNotifier();
  return "on";
}

function seen(key) {
  try {
    return (sessionStorage.getItem(SEEN_KEY) || "").split(",").includes(key);
  } catch {
    return false;
  }
}

function markSeen(key) {
  try {
    const keys = new Set((sessionStorage.getItem(SEEN_KEY) || "").split(",").filter(Boolean));
    keys.add(key);
    sessionStorage.setItem(SEEN_KEY, [...keys].join(","));
  } catch { /* a second poll may show the same notice once more */ }
}

export async function showNotice({ key, title, body, screen }) {
  if (!notifyEnabled() || seen(key)) return;
  markSeen(key);
  const data = { screen: screen || "" };
  try {
    const reg = await registerNotifier();
    if (reg) {
      await reg.showNotification(title, { body, tag: key, data });
      return;
    }
  } catch { /* fall through to a page notification */ }
  try {
    const note = new Notification(title, { body, tag: key, data });
    note.onclick = () => {
      window.focus();
      note.close();
      window.dispatchEvent(new CustomEvent("afriresq-go", { detail: screen || "" }));
    };
  } catch { /* this browser did not show the notice */ }
}
