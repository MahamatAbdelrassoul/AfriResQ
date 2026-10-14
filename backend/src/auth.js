import { createHash, randomBytes, randomInt } from "node:crypto";
import { Router } from "express";
import { bearer, codeMatches, hashCode } from "./desks.js";
import { sendStudentCode } from "./mail.js";
import { sendSmsCode } from "./ugsms.js";

const CODE_TTL = "10 minutes";
const SESSION_TTL = "30 days";
const COOLDOWN_SECONDS = 45;
const HOURLY_LIMIT = 5;
const MAX_ATTEMPTS = 5;

function studentDomain() {
  return String(process.env.STUDENT_EMAIL_DOMAIN || "students.mak.ac.ug").trim().toLowerCase();
}

export function isStudentEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const domain = studentDomain().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[^@\\s]+@${domain}$`).test(email) ? email : "";
}

export function ugandaPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("256") && digits.length >= 12) digits = digits.slice(3);
  else if (digits.startsWith("0") && digits.length === 10) digits = digits.slice(1);
  if (!/^7\d{8}$/.test(digits)) return null;
  return { national: digits, local: `0${digits}` };
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function destinationAccount(pool, channel, destination) {
  const found = channel === "sms"
    ? await pool.query("select profile_done from people where phone_digits = $1", [destination])
    : await pool.query("select profile_done from people where lower(email) = $1", [destination]);
  return found.rows[0] || null;
}

export async function authSession(pool, token) {
  if (!/^[a-f0-9]{64}$/i.test(token || "")) return null;
  const found = await pool.query(
    `select channel, destination, purpose
     from auth_sessions
     where token_hash = $1 and expires_at > now()`,
    [tokenHash(token)],
  );
  return found.rows[0] || null;
}

export function authRouter(pool) {
  const router = Router();

  router.post("/otp", async (req, res) => {
    const channel = req.body?.channel === "email" ? "email" : req.body?.channel === "sms" ? "sms" : "";
    const purpose = req.body?.purpose === "signin" ? "signin" : req.body?.purpose === "signup" ? "signup" : "";
    if (!channel || !purpose) {
      res.status(400).json({ error: "Say whether this code is for a phone or a student email." });
      return;
    }

    const phone = ugandaPhone(req.body?.phone);
    const email = isStudentEmail(req.body?.email);
    if (channel === "sms" && !phone) {
      res.status(400).json({ error: "Enter a Uganda mobile number, for example 772 123 456." });
      return;
    }
    if (channel === "email" && !email) {
      res.status(400).json({ error: `Use a Makerere student email, name@${studentDomain()}.` });
      return;
    }
    const destination = channel === "sms" ? phone.national : email;

    try {
      const account = await destinationAccount(pool, channel, destination);
      if (purpose === "signin" && !account?.profile_done) {
        res.status(404).json({
          error: channel === "sms"
            ? "No citizen account uses that number. Join first."
            : "No student account uses that email. Join first.",
        });
        return;
      }
      if (purpose === "signup" && account?.profile_done) {
        res.status(409).json({
          error: channel === "sms"
            ? "That number already has an account. Sign in instead."
            : "That student email already has an account. Sign in instead.",
        });
        return;
      }

      const recent = await pool.query(
        `select
           count(*) filter (where created_at > now() - interval '1 hour')::int as hour_count,
           max(created_at) as latest
         from auth_codes
         where destination = $1`,
        [destination],
      );
      const stats = recent.rows[0];
      if (Number(stats.hour_count) >= HOURLY_LIMIT) {
        res.status(429).json({ error: "Too many codes for this number or email. Wait an hour and try again." });
        return;
      }
      if (stats.latest && Date.now() - new Date(stats.latest).getTime() < COOLDOWN_SECONDS * 1000) {
        res.status(429).json({ error: "A code was just sent. Wait a moment before asking for another." });
        return;
      }

      const code = String(randomInt(0, 1000000)).padStart(6, "0");
      const saved = await pool.query(
        `insert into auth_codes (channel, destination, code_hash, purpose, expires_at)
         values ($1, $2, $3, $4, now() + interval '${CODE_TTL}')
         returning id`,
        [channel, destination, hashCode(code), purpose],
      );

      try {
        if (channel === "sms") await sendSmsCode(phone.local, code);
        else await sendStudentCode(email, code);
      } catch (err) {
        await pool.query("delete from auth_codes where id = $1", [saved.rows[0].id]);
        res.status(err.status || 502).json({ error: err.message || "The code could not be sent." });
        return;
      }

      res.json({
        sent: true,
        channel,
        destination: channel === "sms" ? `+256 ${phone.national}` : email,
      });
    } catch (err) {
      res.status(503).json({ error: err.message || "The code could not be sent." });
    }
  });

  router.post("/otp/verify", async (req, res) => {
    const channel = req.body?.channel === "email" ? "email" : req.body?.channel === "sms" ? "sms" : "";
    const code = String(req.body?.code || "").replace(/\D/g, "");
    const phone = ugandaPhone(req.body?.phone);
    const email = isStudentEmail(req.body?.email);
    const destination = channel === "sms" ? phone?.national : channel === "email" ? email : "";
    if (!destination || code.length !== 6) {
      res.status(400).json({ error: "Enter the 6-digit code from the message." });
      return;
    }

    try {
      const found = await pool.query(
        `select id, code_hash, purpose, attempts
         from auth_codes
         where channel = $1 and destination = $2 and consumed_at is null and expires_at > now()
         order by created_at desc
         limit 1`,
        [channel, destination],
      );
      const row = found.rows[0];
      if (!row) {
        res.status(401).json({ error: "That code has expired. Ask for a new one." });
        return;
      }
      if (row.attempts >= MAX_ATTEMPTS) {
        res.status(401).json({ error: "Too many tries. Ask for a new code." });
        return;
      }
      if (!codeMatches(code, row.code_hash)) {
        await pool.query("update auth_codes set attempts = attempts + 1 where id = $1", [row.id]);
        res.status(401).json({ error: "That code is not right." });
        return;
      }

      await pool.query("update auth_codes set consumed_at = now() where id = $1", [row.id]);
      const token = randomBytes(32).toString("hex");
      await pool.query(
        `insert into auth_sessions (token_hash, channel, destination, purpose, expires_at)
         values ($1, $2, $3, $4, now() + interval '${SESSION_TTL}')`,
        [tokenHash(token), channel, destination, row.purpose],
      );

      let account = null;
      if (row.purpose === "signin") {
        const person = channel === "sms"
          ? await pool.query("select * from people where phone_digits = $1", [destination])
          : await pool.query("select * from people where lower(email) = $1", [destination]);
        if (person.rows[0]) {
          const { fromRow } = await import("./people.js");
          account = fromRow(person.rows[0]);
        }
      }

      res.json({ verified: true, token, account });
    } catch {
      res.status(503).json({ error: "The code could not be checked." });
    }
  });

  return router;
}

export function sessionToken(req) {
  return bearer(req);
}
