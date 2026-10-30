import { createCase, CaseSendError } from "./case-api.js";

// Unsent alerts live on the phone. IndexedDB is the store a Capacitor app can keep
// across restarts, the same role Room or SQLite has in a native app.
const DB_NAME = "afriresq";
const STORE = "outbox";
const FALLBACK_KEY = "afriresq-outbox";
const BASE_MS = 2000;
const CAP_MS = 120000;

export function newClientRef() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function waitMs(attempts) {
  return Math.min(CAP_MS, BASE_MS * 2 ** Math.min(attempts, 6));
}

function readFallback() {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeFallback(rows) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(rows));
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("no indexedDB"));
      return;
    }
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientRef" });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(open.result);
  });
}

async function readIdb() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function listPending() {
  const local = readFallback();
  try {
    const stored = await readIdb();
    const byRef = new Map(local.map((row) => [row.clientRef, row]));
    for (const row of stored) byRef.set(row.clientRef, row);
    return [...byRef.values()];
  } catch {
    return local;
  }
}

async function saveItem(item) {
  const rows = readFallback().filter((row) => row.clientRef !== item.clientRef);
  rows.push(item);
  writeFallback(rows);
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* the local copy is enough until IndexedDB is available */
  }
}

async function removeItem(clientRef) {
  writeFallback(readFallback().filter((row) => row.clientRef !== clientRef));
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(clientRef);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* the local copy is already gone */
  }
}

export function localCase(item) {
  const payload = item.payload || {};
  return {
    id: "Waiting",
    clientRef: item.clientRef,
    queued: true,
    state: "queued",
    kind: payload.kind,
    path: payload.path,
    place: payload.placeId,
    desk: payload.desk || "",
    what: payload.what,
    where: payload.whereMode,
    whereLat: payload.whereLat,
    whereLng: payload.whereLng,
    otherType: payload.otherType || "",
    declineReason: "",
  };
}

export async function dropQueued(clientRef) {
  if (!clientRef) return;
  await removeItem(clientRef);
}

export async function enqueueCase(payload) {
  const clientRef = payload.clientRef || newClientRef();
  const item = {
    clientRef,
    payload: { ...payload, clientRef },
    attempts: 0,
    nextAt: 0,
    createdAt: Date.now(),
  };
  await saveItem(item);
  return item;
}

let ticking = false;
let timer = 0;

async function deliverOne(handlers) {
  if (ticking) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const token = localStorage.getItem("afriresq-auth") || "";
  if (!token) return;
  const due = (await listPending())
    .filter((item) => !item.nextAt || item.nextAt <= Date.now())
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!due) return;
  ticking = true;
  try {
    const saved = await createCase(due.payload, token);
    await removeItem(due.clientRef);
    handlers.onSent?.(saved);
  } catch (err) {
    if (err instanceof CaseSendError && err.retry) {
      const attempts = due.attempts + 1;
      await saveItem({ ...due, attempts, nextAt: Date.now() + waitMs(attempts - 1) });
      return;
    }
    await removeItem(due.clientRef);
    handlers.onGiveUp?.(due, err.message || "The case could not be saved.");
  } finally {
    ticking = false;
  }
}

export function startOutbox(handlers = {}) {
  const kick = () => {
    deliverOne(handlers).catch(() => {});
  };
  const online = () => {
    listPending()
      .then((rows) => Promise.all(rows.map((row) => saveItem({ ...row, nextAt: 0 }))))
      .then(kick)
      .catch(kick);
  };
  kick();
  timer = window.setInterval(kick, 2000);
  window.addEventListener("online", online);
  document.addEventListener("visibilitychange", kick);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("online", online);
    document.removeEventListener("visibilitychange", kick);
  };
}
