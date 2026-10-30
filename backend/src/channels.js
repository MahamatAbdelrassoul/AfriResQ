import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { ugandaPhone } from "./auth.js";
import { chooseDesk, notifyDesk, saveCase } from "./cases.js";
import { sendSms } from "./ugsms.js";

const SERVICES = {
  "1": { kind: "medical", path: "ambulance", what: "Ambulance", placeId: "mak", desk: "Makerere University Hospital", otherType: "" },
  ambulance: { kind: "medical", path: "ambulance", what: "Ambulance", placeId: "mak", desk: "Makerere University Hospital", otherType: "" },
  amb: { kind: "medical", path: "ambulance", what: "Ambulance", placeId: "mak", desk: "Makerere University Hospital", otherType: "" },
  medical: { kind: "medical", path: "ambulance", what: "Ambulance", placeId: "mak", desk: "Makerere University Hospital", otherType: "" },
  "2": { kind: "other", path: "desk", what: "Police", placeId: "mps", desk: "Makerere Police Station", otherType: "security" },
  police: { kind: "other", path: "desk", what: "Police", placeId: "mps", desk: "Makerere Police Station", otherType: "security" },
  "3": { kind: "other", path: "desk", what: "Fire", placeId: "", desk: "Fire and rescue desk", otherType: "fire" },
  fire: { kind: "other", path: "desk", what: "Fire", placeId: "", desk: "Fire and rescue desk", otherType: "fire" },
};

function ussdCode() {
  return String(process.env.USSD_CODE || "*284#").trim() || "*284#";
}

function allowed(req) {
  const key = String(process.env.CHANNEL_WEBHOOK_KEY || "").trim();
  if (!key) return false;
  const given = String(req.get("x-afriresq-key") || req.query.key || "").trim();
  const left = Buffer.from(given);
  const right = Buffer.from(key);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function clientRef(prefix, raw, phone, extra) {
  const cleaned = String(raw || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
  const stem = cleaned || createHash("sha256").update(`${phone}|${extra}|${Math.floor(Date.now() / 60000)}`).digest("hex").slice(0, 24);
  return `${prefix}-${stem}`.slice(0, 80);
}

async function ensureCaller(pool, phone) {
  await pool.query(
    `insert into people (phone, phone_digits, person_type, name, profile_done)
     values ($1, $2, 'citizen', 'Called from a phone', false)
     on conflict (phone_digits) do nothing`,
    [`+256 ${phone.national}`, phone.national],
  );
  const found = await pool.query("select blocked from people where phone_digits = $1", [phone.national]);
  return found.rows[0] || null;
}

async function recentCount(pool, phoneDigits, ref) {
  const found = await pool.query(
    `select count(*)::int as n from cases
     where phone_digits = $1 and created_at > now() - interval '1 hour' and client_ref is distinct from $2`,
    [phoneDigits, ref],
  );
  return found.rows[0]?.n || 0;
}

async function openFromPhone(pool, phone, service, where, ref) {
  const person = await ensureCaller(pool, phone);
  if (!person) return { error: "END AfriResQ could not save this. Call 999 or 112." };
  if (person.blocked) return { error: "END This number cannot send cases. Call 999 or 112." };
  if (await recentCount(pool, phone.national, ref) >= 5) {
    return { error: "END AfriResQ already has several alerts from this phone. Call 999 or 112." };
  }
  let placeId = service.placeId;
  let desk = service.desk;
  if (service.path === "desk") {
    const chosen = await chooseDesk(pool, { otherType: service.otherType, placeId });
    if (!chosen) return { error: "END No desk is taking this report. Call 999 or 112." };
    placeId = chosen.placeId;
    desk = chosen.desk;
  }
  const saved = await saveCase(pool, {
    phoneDigits: phone.national,
    kind: service.kind,
    path: service.path,
    what: service.what,
    who: "me",
    whereMode: "written",
    whereText: where.slice(0, 240),
    placeId,
    desk,
    otherType: service.otherType,
    detail: "Sent from a phone with no internet.",
    state: "sent",
    clientRef: ref,
  });
  if (saved.created) {
    notifyDesk(
      pool,
      placeId,
      `AfriResQ ${saved.row.public_id}. ${service.what}. ${where}. From 0${phone.national}.`,
    ).catch((err) => console.error("Desk SMS failed:", err.message));
  }
  return { id: saved.row.public_id };
}

function ussdScreen(body) {
  const text = String(body.text || "").trim();
  const parts = text ? text.split("*") : [];
  const choice = (parts[0] || "").trim();
  const where = parts.slice(1).join(" ").trim();
  if (!choice) {
    return {
      reply: `CON AfriResQ\n1 Ambulance\n2 Police\n3 Fire\nIn danger call 999 or 112`,
    };
  }
  const service = SERVICES[choice];
  if (!service) return { reply: "END AfriResQ did not understand. Dial again. In danger call 999 or 112." };
  if (!where) return { reply: "CON Where are you? Type the place." };
  return { service, where };
}

const dialHits = new Map();

function dialLimited(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || "local");
  const now = Date.now();
  const fresh = (dialHits.get(ip) || []).filter((at) => now - at < 60_000);
  if (fresh.length >= 30) return true;
  fresh.push(now);
  dialHits.set(ip, fresh);
  return false;
}

async function runUssd(pool, body) {
  const phone = ugandaPhone(body?.phoneNumber || body?.phone);
  if (!phone) return "END AfriResQ needs a Uganda mobile number. Call 999 or 112.";
  const screen = ussdScreen(body || {});
  if (!screen.service) return screen.reply;
  const opened = await openFromPhone(
    pool,
    phone,
    screen.service,
    screen.where,
    clientRef("ussd", body?.sessionId, phone.national, screen.where),
  );
  return opened.error || `END AfriResQ has ${opened.id}. Stay there. Call 999 or 112 if danger is immediate.`;
}

export function channelsRouter(pool) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ ussd: ussdCode(), sms: "AMBULANCE Wandegeya" });
  });

  router.post("/ussd", async (req, res) => {
    if (!allowed(req)) {
      res.status(401).type("text/plain").send("END AfriResQ is not accepting this line yet.");
      return;
    }
    try {
      res.type("text/plain").send(await runUssd(pool, req.body || {}));
    } catch {
      res.type("text/plain").send("END AfriResQ could not save this. Call 999 or 112.");
    }
  });

  // The same menu, started from the AfriResQ screen. The gateway key stays off the website.
  router.post("/dial", async (req, res) => {
    if (dialLimited(req)) {
      res.status(429).json({ error: "Too many tries from this connection. Wait a minute, or call 999 or 112." });
      return;
    }
    try {
      res.json({ reply: await runUssd(pool, req.body || {}) });
    } catch {
      res.status(503).json({ error: "AfriResQ could not save this. Call 999 or 112." });
    }
  });

  router.post("/sms", async (req, res) => {
    if (!allowed(req)) {
      res.status(401).json({ error: "AfriResQ is not accepting this line yet." });
      return;
    }
    const phone = ugandaPhone(req.body?.from || req.body?.phoneNumber || req.body?.msisdn || req.body?.phone);
    const raw = String(req.body?.text || req.body?.message || req.body?.message_body || "").trim();
    const code = ussdCode();
    const help = `AfriResQ. Text AMBULANCE and the place, or POLICE, or FIRE. Example: AMBULANCE Wandegeya. No data: dial ${code}. In danger call 999 or 112.`;
    if (!phone) {
      res.status(200).json({ reply: help });
      return;
    }
    const match = /^(ambulance|amb|medical|police|fire|help)\b\s*(.*)$/i.exec(raw.replace(/\s+/g, " "));
    const word = match?.[1]?.toLowerCase() || "";
    const where = (match?.[2] || "").trim();
    let reply = help;
    if (word && word !== "help" && !where) reply = "AfriResQ. Add the place. Example: AMBULANCE Wandegeya.";
    if (word && word !== "help" && where) {
      try {
        const opened = await openFromPhone(
          pool,
          phone,
          SERVICES[word],
          where,
          clientRef("sms", req.body?.id || req.body?.messageId || req.body?.linkId, phone.national, `${word}|${where}`),
        );
        reply = opened.error
          ? opened.error.replace(/^END /, "")
          : `AfriResQ has ${opened.id}. Stay there. Call 999 or 112 if danger is immediate.`;
      } catch {
        reply = "AfriResQ could not save this. Call 999 or 112.";
      }
    }
    sendSms(phone.local, reply).catch((err) => console.error("Alert reply SMS failed:", err.message));
    res.json({ reply });
  });

  return router;
}
