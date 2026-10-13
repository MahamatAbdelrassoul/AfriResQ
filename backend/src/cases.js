import { Router } from "express";
import { deskFromRequest } from "./desks.js";

const STATES = new Set(["sent", "accepted", "on_the_way", "arrived", "closed", "cancelled"]);
const KINDS = new Set(["medical", "other"]);
const PATHS = new Set(["ambulance", "route", "desk"]);

function digits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function text(value) {
  return String(value || "").trim();
}

const CASE_SELECT = `
  select c.*,
    p.name as person_name,
    p.phone as person_phone,
    p.person_type,
    p.hall,
    p.blood,
    p.allergies,
    p.conditions,
    p.medications,
    p.share_medical
  from cases c
  join people p on p.phone_digits = c.phone_digits
`;

function fromRow(row, full) {
  return {
    id: row.public_id,
    kind: row.kind,
    type: row.what,
    otherType: row.other_type,
    path: row.path,
    state: row.state,
    place: row.place_id,
    desk: row.desk,
    what: row.what,
    awake: row.awake,
    who: row.who_needs_help,
    where: row.where_mode,
    whereText: row.where_text,
    whereLat: row.where_lat == null ? null : Number(row.where_lat),
    whereLng: row.where_lng == null ? null : Number(row.where_lng),
    detail: row.detail || "",
    rating: row.rating,
    person: full && row.person_name
      ? {
          name: row.person_name,
          phone: row.person_phone,
          type: row.person_type,
          hall: row.hall || "",
          share: row.share_medical !== false,
          med: {
            blood: row.blood || "",
            allergies: row.allergies || "",
            cond: row.conditions || "",
            meds: row.medications || "",
          },
        }
      : null,
  };
}

async function readCase(pool, publicId) {
  const found = await pool.query(`${CASE_SELECT} where c.public_id = $1`, [publicId]);
  return found.rows[0] || null;
}

export function casesRouter(pool) {
  const router = Router();

  router.post("/", async (req, res) => {
    const body = req.body || {};
    const phoneDigits = digits(body.phone);
    const kind = text(body.kind);
    const path = text(body.path);
    const what = text(body.what);
    const state = text(body.state) || "sent";
    if (phoneDigits.length < 9) {
      res.status(400).json({ error: "A case needs the person's phone number." });
      return;
    }
    if (!KINDS.has(kind)) {
      res.status(400).json({ error: "Say whether this case is medical or another desk." });
      return;
    }
    if (!PATHS.has(path)) {
      res.status(400).json({ error: "Say whether this is an ambulance, a route, or a desk." });
      return;
    }
    if (!what) {
      res.status(400).json({ error: "Say what is happening." });
      return;
    }
    if (!STATES.has(state)) {
      res.status(400).json({ error: "That case state is not one AfriResQ uses." });
      return;
    }
    const lat = Number(body.whereLat);
    const lng = Number(body.whereLng);
    try {
      const person = await pool.query("select 1 from people where phone_digits = $1", [phoneDigits]);
      if (!person.rows[0]) {
        res.status(409).json({ error: "Save the profile before opening a case." });
        return;
      }
      const saved = await pool.query(
        `insert into cases (
           phone_digits, kind, what, awake, who_needs_help, where_mode, where_text, where_lat, where_lng,
           building, room, landmark, place_id, desk, path, other_type, detail, state, closed_at
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
           case when $18 in ('closed', 'cancelled') then now() else null end
         ) returning public_id`,
        [
          phoneDigits,
          kind,
          what,
          text(body.awake),
          text(body.who) || "me",
          text(body.whereMode) || "gps",
          text(body.whereText),
          Number.isFinite(lat) ? lat : null,
          Number.isFinite(lng) ? lng : null,
          text(body.building),
          text(body.room),
          text(body.landmark),
          text(body.placeId),
          text(body.desk),
          path,
          text(body.otherType),
          text(body.detail),
          state,
        ],
      );
      const row = await readCase(pool, saved.rows[0].public_id);
      res.status(201).json(fromRow(row, false));
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.patch("/:id", async (req, res) => {
    const body = req.body || {};
    const state = body.state == null ? null : text(body.state);
    if (state && !STATES.has(state)) {
      res.status(400).json({ error: "That case state is not one AfriResQ uses." });
      return;
    }
    let rating = null;
    if (body.rating != null && body.rating !== "") {
      rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        res.status(400).json({ error: "A rating is from 1 to 5." });
        return;
      }
    }
    try {
      const current = await readCase(pool, req.params.id);
      if (!current) {
        res.status(404).json({ error: "No case is saved with that number." });
        return;
      }
      const desk = await deskFromRequest(pool, req);
      const ownPhone = digits(body.phone) === current.phone_digits && digits(body.phone).length >= 9;
      const ownDesk = desk?.place_id === current.place_id;
      if (state === "accepted" || state === "on_the_way" || state === "arrived") {
        if (!ownDesk) {
          res.status(401).json({ error: "Sign in to this desk first." });
          return;
        }
      }
      if (state === "closed" && !ownDesk) {
        const place = await pool.query("select receives from places where id = $1", [current.place_id]);
        const receives = place.rows[0]?.receives === true;
        const personMayClose = ownPhone && (!receives || current.state === "arrived" || current.state === "closed");
        if (!personMayClose) {
          res.status(401).json({ error: "Sign in to this desk first." });
          return;
        }
      }
      if (state === "cancelled" && !ownPhone) {
        res.status(401).json({ error: "This case belongs to the person who sent it." });
        return;
      }
      if (rating != null && !ownPhone && !ownDesk) {
        res.status(401).json({ error: "This case belongs to the person who sent it." });
        return;
      }
      const lat = Number(body.whereLat);
      const lng = Number(body.whereLng);
      const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
      if (hasPoint && !ownPhone) {
        res.status(401).json({ error: "This case belongs to the person who sent it." });
        return;
      }
      const saved = await pool.query(
        `update cases set
           state = coalesce($2, state),
           rating = case when $3::boolean then $4 else rating end,
           where_lat = case when $5::boolean then $6 else where_lat end,
           where_lng = case when $5::boolean then $7 else where_lng end,
           where_text = case when $5::boolean and $8 <> '' then $8 else where_text end,
           closed_at = case when $2 in ('closed', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
           updated_at = now()
         where public_id = $1`,
        [req.params.id, state, body.rating != null && body.rating !== "", rating, hasPoint, hasPoint ? lat : null, hasPoint ? lng : null, text(body.whereText)],
      );
      if (!saved.rowCount) {
        res.status(404).json({ error: "No case is saved with that number." });
        return;
      }
      const row = await readCase(pool, req.params.id);
      res.json(fromRow(row, ownDesk));
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const row = await readCase(pool, req.params.id);
      if (!row) {
        res.status(404).json({ error: "No case is saved with that number." });
        return;
      }
      const desk = await deskFromRequest(pool, req);
      res.json(fromRow(row, desk?.place_id === row.place_id));
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.get("/", async (req, res) => {
    const placeId = text(req.query.place);
    const phoneDigits = digits(req.query.phone);
    if (!placeId && phoneDigits.length < 9) {
      res.status(400).json({ error: "Look up cases by phone number or by desk." });
      return;
    }
    const closed = req.query.status === "closed";
    try {
      if (placeId) {
        const desk = await deskFromRequest(pool, req);
        if (desk?.place_id !== placeId) {
          res.status(401).json({ error: "Sign in to this desk first." });
          return;
        }
      }
      const found = placeId
        ? await pool.query(
            `${CASE_SELECT}
             where c.place_id = $1
               and c.state ${closed ? "= 'closed'" : "not in ('closed', 'cancelled')"}
             order by c.created_at ${closed ? "desc" : "asc"}`,
            [placeId],
          )
        : await pool.query(
            `${CASE_SELECT} where c.phone_digits = $1 order by c.created_at desc`,
            [phoneDigits],
          );
      res.json(found.rows.map((row) => fromRow(row, Boolean(placeId))));
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  return router;
}
