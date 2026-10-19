import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Router } from "express";

const KEY_LEN = 32;

function deskCodes() {
  return [
    ["mak", process.env.DESK_HOSPITAL_CODE || "481926"],
    ["mps", process.env.DESK_POLICE_CODE || "730614"],
  ];
}

export function hashCode(code) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(code), salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

export function codeMatches(code, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(String(code), salt, KEY_LEN);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export function bearer(req) {
  const header = String(req.get("authorization") || "");
  const match = header.match(/^Bearer\s+([a-f0-9]{64})$/i);
  return match ? match[1] : "";
}

export async function seedDeskCodes(pool) {
  for (const [placeId, code] of deskCodes()) {
    await pool.query(
      `insert into desk_codes (place_id, code_hash)
       values ($1, $2)
       on conflict (place_id) do nothing`,
      [placeId, hashCode(code)],
    );
  }
}

// A desk code session, or a confirmed partner connected to a place. Both work that place's cases.
export async function deskFromRequest(pool, req) {
  const token = bearer(req);
  if (!token) return null;
  const found = await pool.query(
    `select place_id from desk_sessions
     where token = $1 and expires_at > now()`,
    [token],
  );
  if (found.rows[0]) return found.rows[0];
  const partner = await pool.query(
    `select p.place_id from partner_sessions s
     join partner_applications p on p.id = s.partner_id
     join places pl on pl.id = p.place_id and pl.receives
     where s.token_hash = $1 and s.expires_at > now()
       and p.status = 'approved'`,
    [createHash("sha256").update(token).digest("hex")],
  );
  return partner.rows[0] || null;
}

// The numbers a desk or partner sees at the top of its cases. "Today" follows Kampala time.
export async function placeStats(pool, placeId) {
  if (!placeId) return null;
  const found = await pool.query(
    `select
       count(*) filter (where state = 'sent')::int as waiting,
       count(*) filter (where state in ('accepted', 'on_the_way', 'arrived'))::int as open,
       count(*) filter (where state = 'closed'
         and closed_at >= (date_trunc('day', now() at time zone 'Africa/Kampala') at time zone 'Africa/Kampala'))::int as closed_today,
       count(*) filter (where state = 'declined' and closed_at > now() - interval '7 days')::int as declined_week,
       count(*) filter (where state = 'closed' and closed_at > now() - interval '7 days')::int as closed_week,
       count(*) filter (where state = 'closed')::int as closed,
       round(avg(rating)::numeric, 1)::float as rating
     from cases where place_id = $1`,
    [placeId],
  );
  return found.rows[0];
}

export function deskRouter(pool) {
  const router = Router();

  router.get("/me", async (req, res) => {
    try {
      const desk = await deskFromRequest(pool, req);
      if (!desk) {
        res.status(401).json({ error: "Sign in to this desk first." });
        return;
      }
      const place = await pool.query("select id, name, kind, phone from places where id = $1", [desk.place_id]);
      res.json({ ...place.rows[0], placeId: desk.place_id, stats: await placeStats(pool, desk.place_id) });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.post("/session", async (req, res) => {
    const placeId = String(req.body?.placeId || "").trim();
    const code = String(req.body?.code || "").trim();
    if (!placeId || !code) {
      res.status(400).json({ error: "Choose a desk and enter its code." });
      return;
    }
    try {
      const found = await pool.query(
        `select c.code_hash, p.name
         from desk_codes c
         join places p on p.id = c.place_id
         where c.place_id = $1 and p.receives = true`,
        [placeId],
      );
      const row = found.rows[0];
      if (!row || !codeMatches(code, row.code_hash)) {
        res.status(401).json({ error: "That desk code is not right." });
        return;
      }
      const token = randomBytes(32).toString("hex");
      await pool.query(
        `insert into desk_sessions (token, place_id, expires_at)
         values ($1, $2, now() + interval '12 hours')`,
        [token, placeId],
      );
      res.json({ token, placeId, name: row.name });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.delete("/session", async (req, res) => {
    const token = bearer(req);
    if (token) {
      try {
        await pool.query("delete from desk_sessions where token = $1", [token]);
      } catch {
        res.status(503).json({ error: "The database is not available." });
        return;
      }
    }
    res.json({ ok: true });
  });

  return router;
}
