import { randomBytes } from "node:crypto";
import { Router } from "express";
import { bearer, codeMatches, hashCode } from "./desks.js";

const STATE_LABEL = {
  sent: "Sent",
  accepted: "Accepted",
  on_the_way: "On the way",
  arrived: "Arrived",
  closed: "Closed",
  cancelled: "Cancelled",
};

function adminCode() {
  return process.env.ADMIN_CODE || "905511";
}

export async function seedAdmin(pool) {
  await pool.query(
    `insert into admin_gate (id, code_hash)
     values (true, $1)
     on conflict (id) do nothing`,
    [hashCode(adminCode())],
  );
}

async function signedIn(pool, req) {
  const token = bearer(req);
  if (!token) return false;
  const found = await pool.query(
    "select 1 from admin_sessions where token = $1 and expires_at > now()",
    [token],
  );
  return Boolean(found.rows[0]);
}

export function adminRouter(pool) {
  const router = Router();

  router.post("/session", async (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      res.status(400).json({ error: "Enter the team code." });
      return;
    }
    try {
      const found = await pool.query("select code_hash from admin_gate where id = true");
      const row = found.rows[0];
      if (!row || !codeMatches(code, row.code_hash)) {
        res.status(401).json({ error: "That team code is not right." });
        return;
      }
      const token = randomBytes(32).toString("hex");
      await pool.query(
        `insert into admin_sessions (token, expires_at)
         values ($1, now() + interval '12 hours')`,
        [token],
      );
      res.json({ token });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.delete("/session", async (req, res) => {
    const token = bearer(req);
    if (token) {
      try {
        await pool.query("delete from admin_sessions where token = $1", [token]);
      } catch {
        res.status(503).json({ error: "The database is not available." });
        return;
      }
    }
    res.json({ ok: true });
  });

  router.get("/overview", async (req, res) => {
    try {
      if (!(await signedIn(pool, req))) {
        res.status(401).json({ error: "Sign in with the team code first." });
        return;
      }
      const places = await pool.query(
        `select p.id, p.kind, p.name, p.short_name, p.receives,
           count(c.id) filter (where c.state not in ('closed', 'cancelled'))::int as open_count,
           count(c.id) filter (where c.state = 'closed')::int as closed_count
         from places p
         left join cases c on c.place_id = p.id
         group by p.id
         order by p.receives desc, p.name`,
      );
      const cases = await pool.query(
        `select c.public_id, c.place_id, c.desk, c.what, c.state, c.where_text, c.created_at,
           p.name as person_name, p.phone as person_phone
         from cases c
         join people p on p.phone_digits = c.phone_digits
         order by c.created_at desc
         limit 40`,
      );
      const applications = await pool.query(
        `select id, organisation, primary_category, extra_categories, phone, email, address, districts,
           services, hours, emergency_ready, licence, representative_name, representative_phone, representative_email, status
         from partner_applications
         order by created_at desc
         limit 40`,
      );
      res.json({
        places: places.rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          name: row.name,
          short: row.short_name,
          receives: row.receives,
          open: row.open_count,
          closed: row.closed_count,
        })),
        cases: cases.rows.map((row) => ({
          id: row.public_id,
          place: row.place_id,
          desk: row.desk,
          what: row.what,
          state: row.state,
          stateLabel: STATE_LABEL[row.state] || row.state,
          whereText: row.where_text,
          person: row.person_name,
          phone: row.person_phone,
        })),
        applications: applications.rows.map((row) => ({
          id: row.id,
          organisation: row.organisation,
          primaryCategory: row.primary_category,
          extraCategories: row.extra_categories || [],
          phone: row.phone,
          email: row.email,
          address: row.address,
          districts: row.districts,
          services: row.services,
          hours: row.hours,
          emergencyReady: row.emergency_ready,
          licence: row.licence,
          representativeName: row.representative_name,
          representativePhone: row.representative_phone,
          representativeEmail: row.representative_email,
          status: row.status,
        })),
      });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.patch("/partners/:id", async (req, res) => {
    const status = String(req.body?.status || "");
    if (status !== "approved" && status !== "declined") {
      res.status(400).json({ error: "Confirm or decline the request." });
      return;
    }
    try {
      if (!(await signedIn(pool, req))) {
        res.status(401).json({ error: "Sign in with the team code first." });
        return;
      }
      const saved = await pool.query(
        `update partner_applications
         set status = $2, updated_at = now()
         where id = $1 and status = 'pending'
         returning organisation, status`,
        [req.params.id, status],
      );
      if (!saved.rows[0]) {
        res.status(404).json({ error: "That request is no longer waiting." });
        return;
      }
      res.json({ ok: true, organisation: saved.rows[0].organisation, status: saved.rows[0].status });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.patch("/desks/:placeId", async (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!/^\d{4,8}$/.test(code)) {
      res.status(400).json({ error: "A desk code is 4 to 8 digits." });
      return;
    }
    try {
      if (!(await signedIn(pool, req))) {
        res.status(401).json({ error: "Sign in with the team code first." });
        return;
      }
      const place = await pool.query(
        "select id, name, receives from places where id = $1",
        [req.params.placeId],
      );
      if (!place.rows[0]?.receives) {
        res.status(404).json({ error: "That place does not have a desk yet." });
        return;
      }
      await pool.query(
        `insert into desk_codes (place_id, code_hash)
         values ($1, $2)
         on conflict (place_id) do update
           set code_hash = excluded.code_hash, updated_at = now()`,
        [req.params.placeId, hashCode(code)],
      );
      await pool.query("delete from desk_sessions where place_id = $1", [req.params.placeId]);
      res.json({ ok: true, name: place.rows[0].name });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  return router;
}
