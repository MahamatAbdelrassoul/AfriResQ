import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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

export async function deskFromRequest(pool, req) {
  const token = bearer(req);
  if (!token) return null;
  const found = await pool.query(
    `select place_id from desk_sessions
     where token = $1 and expires_at > now()`,
    [token],
  );
  return found.rows[0] || null;
}

export function deskRouter(pool) {
  const router = Router();

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
