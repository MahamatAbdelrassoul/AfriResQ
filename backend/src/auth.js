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
const MAX_PASSWORD_TRIES = 5;
const LOCK_TIME = "15 minutes";
export const PASSWORD_MIN = 8;

function studentDomain() {
  return String(process.env.STUDENT_EMAIL_DOMAIN || "students.mak.ac.ug").trim().toLowerCase();
}

function emailShape(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^@\s]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(email) ? email : "";
}

export function isStudentEmail(value) {
  const email = emailShape(value);
  if (!email) return "";
  return email.split("@")[1] === studentDomain() ? email : "";
}

export async function acceptedStudentEmail(pool, value) {
  const email = emailShape(value);
  if (!email) return "";
  const domain = email.split("@")[1];
  if (domain === studentDomain()) return email;
  const found = await pool.query(
    `select 1 from partner_applications
     where status = 'approved' and applicant_kind = 'university' and lower(student_domain) = $1
     limit 1`,
    [domain],
  );
  return found.rowCount ? email : "";
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

async function openSession(pool, channel, destination, purpose) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `insert into auth_sessions (token_hash, channel, destination, purpose, expires_at)
     values ($1, $2, $3, $4, now() + interval '${SESSION_TTL}')`,
    [tokenHash(token), channel, destination, purpose],
  );
  return token;
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

// The person behind a request, proven by the SMS or student-email sign-in.
// A phone number in the request body proves nothing: anyone can type one.
export async function personFromRequest(pool, req) {
  const session = await authSession(pool, bearer(req));
  if (!session) return null;
  if (session.channel === "sms") return { phoneDigits: session.destination };
  const found = await pool.query("select phone_digits from people where lower(email) = $1", [session.destination]);
  return found.rows[0] ? { phoneDigits: found.rows[0].phone_digits } : null;
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
    const email = channel === "email" ? await acceptedStudentEmail(pool, req.body?.email) : "";
    if (channel === "sms" && !phone) {
      res.status(400).json({ error: "Enter a Uganda mobile number, for example 772 123 456." });
      return;
    }
    if (channel === "email" && !email) {
      res.status(400).json({ error: "Use a student email from a university AfriResQ has confirmed." });
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
    const email = channel === "email" ? await acceptedStudentEmail(pool, req.body?.email) : "";
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
      const token = await openSession(pool, channel, destination, row.purpose);

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

  // Phone or email plus the password chosen at sign-up. Citizens and students both use it.
  router.post("/login", async (req, res) => {
    const password = String(req.body?.password || "");
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = ugandaPhone(req.body?.phone);
    if (!password || (!email && !phone)) {
      res.status(400).json({ error: "Enter your phone number or email, and your password." });
      return;
    }

    try {
      const found = email
        ? await pool.query("select * from people where lower(email) = $1 and email <> ''", [email])
        : await pool.query("select * from people where phone_digits = $1", [phone.national]);
      const person = found.rows[0];
      const wrong = email ? "That email or password is not right." : "That phone number or password is not right.";
      if (!person?.profile_done) {
        res.status(401).json({ error: wrong });
        return;
      }
      if (person.locked_until && new Date(person.locked_until) > new Date()) {
        res.status(429).json({ error: "Too many wrong passwords. Wait 15 minutes, or sign in with a code." });
        return;
      }
      if (!person.password_hash) {
        res.status(409).json({ error: "This account has no password yet. Sign in with a code, then add one under Account." });
        return;
      }
      if (!codeMatches(password, person.password_hash)) {
        await pool.query(
          `update people set
             failed_logins = case when failed_logins + 1 >= $2 then 0 else failed_logins + 1 end,
             locked_until = case when failed_logins + 1 >= $2 then now() + interval '${LOCK_TIME}' else locked_until end
           where id = $1`,
          [person.id, MAX_PASSWORD_TRIES],
        );
        res.status(401).json({ error: wrong });
        return;
      }

      await pool.query("update people set failed_logins = 0, locked_until = null where id = $1", [person.id]);
      // The same proof a code gives: students by their university email, citizens by phone.
      const student = person.person_type === "student";
      const token = await openSession(
        pool,
        student ? "email" : "sms",
        student ? person.email.toLowerCase() : person.phone_digits,
        "signin",
      );
      const { fromRow } = await import("./people.js");
      res.json({ token, account: fromRow(person) });
    } catch {
      res.status(503).json({ error: "Sign-in is not available right now." });
    }
  });

  router.get("/universities", async (_req, res) => {
    try {
      const makerere = studentDomain();
      const found = await pool.query(
        `select organisation, city, student_domain
         from partner_applications
         where status = 'approved' and applicant_kind = 'university' and student_domain <> ''
         order by organisation`,
      );
      const universities = [{ name: "Makerere University", city: "Kampala", domain: makerere }];
      for (const row of found.rows) {
        const domain = String(row.student_domain || "").toLowerCase();
        if (!domain || domain === makerere) continue;
        universities.push({ name: row.organisation, city: row.city || "", domain });
      }
      res.json({ universities });
    } catch {
      res.status(503).json({ error: "The university list is not available." });
    }
  });

  return router;
}

export function sessionToken(req) {
  return bearer(req);
}
