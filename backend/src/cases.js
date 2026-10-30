import { Router } from "express";
import { personFromRequest, ugandaPhone } from "./auth.js";
import { deskFromRequest } from "./desks.js";
import { partnerTaking } from "./partners.js";
import { sendSms } from "./ugsms.js";

const STATES = new Set(["sent", "accepted", "on_the_way", "arrived", "closed", "cancelled", "declined"]);
const FINISHED = new Set(["closed", "cancelled", "declined"]);
// The order a desk moves a case in. A desk cannot skip back or reopen a finished case.
const DESK_ORDER = { sent: 0, accepted: 1, on_the_way: 2, arrived: 3, closed: 4 };
const KINDS = new Set(["medical", "other"]);
const PATHS = new Set(["ambulance", "route", "desk"]);
// Each other-emergency tile reaches a desk of this kind. Police is the staffed fallback.
const RESPONDER_KINDS = {
  accident: ["police"],
  security: ["police"],
  missing: ["police"],
  fire: ["fire"],
  disaster: ["disaster"],
  other: ["disaster"],
};
const FALLBACK_DESK = "mps";

// The nearest on-duty place of the right kind. A built-in desk has no partner row and stays eligible.
// When no specialist is on duty, Makerere Police Station takes the report so a person still sees it.
export async function chooseDesk(pool, { otherType, lat, lng, placeId }) {
  const kinds = RESPONDER_KINDS[otherType] || ["disaster"];
  const open = `(pa.availability is null or pa.availability in ('available', 'busy'))`;
  if (placeId) {
    const current = await pool.query(
      `select p.id, p.name, p.kind, p.receives, pa.availability
       from places p
       left join partner_applications pa on pa.place_id = p.id and pa.status = 'approved'
       where p.id = $1`,
      [placeId],
    );
    const row = current.rows[0];
    const taking = row?.receives === true && (!row.availability || row.availability === "available" || row.availability === "busy");
    if (taking && (kinds.includes(row.kind) || row.id === FALLBACK_DESK)) {
      return { placeId: row.id, desk: row.name };
    }
  }
  const params = [kinds];
  let order = "order by p.distance_km, p.name";
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    params.push(lng, lat);
    order = "order by p.location <-> st_setsrid(st_makepoint($2, $3), 4326)::geography";
  }
  const found = await pool.query(
    `select p.id, p.name
     from places p
     left join partner_applications pa on pa.place_id = p.id and pa.status = 'approved'
     where p.receives = true and p.kind = any($1::text[]) and ${open}
     ${order}
     limit 1`,
    params,
  );
  if (found.rows[0]) return { placeId: found.rows[0].id, desk: found.rows[0].name };
  const fallback = await pool.query(
    `select p.id, p.name from places p
     left join partner_applications pa on pa.place_id = p.id and pa.status = 'approved'
     where p.id = $1 and p.receives = true and ${open}`,
    [FALLBACK_DESK],
  );
  if (fallback.rows[0]) return { placeId: fallback.rows[0].id, desk: fallback.rows[0].name };
  return null;
}

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
    declineReason: row.decline_reason || "",
    clientRef: row.client_ref || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

// One insert for the app and for a phone that has no internet. A repeated clientRef is the same case.
export async function saveCase(pool, input) {
  const clientRef = input.clientRef || null;
  if (clientRef) {
    const again = await pool.query(`${CASE_SELECT} where c.client_ref = $1 and c.phone_digits = $2`, [clientRef, input.phoneDigits]);
    if (again.rows[0]) return { row: again.rows[0], created: false };
  }
  try {
    const saved = await pool.query(
      `insert into cases (
         phone_digits, kind, what, awake, who_needs_help, where_mode, where_text, where_lat, where_lng,
         building, room, landmark, place_id, desk, path, other_type, detail, state, client_ref, closed_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
         case when $18 in ('closed', 'cancelled') then now() else null end
       ) returning public_id`,
      [
        input.phoneDigits,
        input.kind,
        input.what,
        text(input.awake),
        text(input.who) || "me",
        text(input.whereMode) || "gps",
        text(input.whereText),
        Number.isFinite(input.whereLat) ? input.whereLat : null,
        Number.isFinite(input.whereLng) ? input.whereLng : null,
        text(input.building),
        text(input.room),
        text(input.landmark),
        text(input.placeId),
        text(input.desk),
        input.path,
        text(input.otherType),
        text(input.detail),
        input.state || "sent",
        clientRef,
      ],
    );
    return { row: await readCase(pool, saved.rows[0].public_id), created: true };
  } catch (err) {
    if (err?.code === "23505" && clientRef) {
      const again = await pool.query(`${CASE_SELECT} where c.client_ref = $1 and c.phone_digits = $2`, [clientRef, input.phoneDigits]);
      if (again.rows[0]) return { row: again.rows[0], created: false };
    }
    throw err;
  }
}

// A desk with a real Uganda mobile hears about a new case even when that phone has no data bundle.
export async function notifyDesk(pool, placeId, message) {
  if (!placeId) return;
  const found = await pool.query(
    `select pl.phone, pa.representative_phone
     from places pl
     left join partner_applications pa on pa.place_id = pl.id and pa.status = 'approved'
     where pl.id = $1`,
    [placeId],
  );
  const row = found.rows[0];
  const phone = ugandaPhone(row?.phone) || ugandaPhone(row?.representative_phone);
  if (!phone) return;
  await sendSms(phone.local, String(message || "").slice(0, 160));
}

export function casesRouter(pool) {
  const router = Router();

  router.post("/", async (req, res) => {
    const body = req.body || {};
    const kind = text(body.kind);
    const path = text(body.path);
    const what = text(body.what);
    const state = text(body.state) || "sent";
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
    if (!STATES.has(state) || state === "declined") {
      res.status(400).json({ error: "That case state is not one AfriResQ uses." });
      return;
    }
    const lat = Number(body.whereLat);
    const lng = Number(body.whereLng);
    const clientRef = text(body.clientRef).slice(0, 80);
    if (clientRef && !/^[A-Za-z0-9_-]{8,80}$/.test(clientRef)) {
      res.status(400).json({ error: "That request could not be recognised." });
      return;
    }
    try {
      // The case belongs to whoever is signed in. A phone number in the body proves nothing.
      const me = await personFromRequest(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again to send a case. In an emergency, call 999 or 112 now." });
        return;
      }
      const phoneDigits = me.phoneDigits;
      const claimed = ugandaPhone(body.phone);
      if (claimed && claimed.national !== phoneDigits) {
        res.status(403).json({ error: "A case can only be sent from your own account." });
        return;
      }
      const person = await pool.query("select blocked from people where phone_digits = $1", [phoneDigits]);
      if (!person.rows[0]) {
        res.status(409).json({ error: "Save the profile before opening a case." });
        return;
      }
      if (person.rows[0].blocked) {
        res.status(403).json({ error: "This number cannot send cases through AfriResQ. In an emergency, call 999 or 112." });
        return;
      }
      let placeId = text(body.placeId);
      let deskName = text(body.desk);
      if (path === "desk") {
        const chosen = await chooseDesk(pool, {
          otherType: text(body.otherType),
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          placeId,
        });
        if (!chosen) {
          res.status(409).json({ error: "No desk is taking this report right now. Call 999 or 112." });
          return;
        }
        placeId = chosen.placeId;
        deskName = chosen.desk;
      } else if (placeId && path === "ambulance") {
        const place = await pool.query("select receives from places where id = $1", [placeId]);
        if (!place.rows[0]?.receives) {
          res.status(409).json({ error: "That place is listed only. Call them, or choose a place connected to AfriResQ." });
          return;
        }
        if (!(await partnerTaking(pool, placeId))) {
          res.status(409).json({ error: "That service is not taking requests right now. Choose another place, or call 999 or 112." });
          return;
        }
      }
      const saved = await saveCase(pool, {
        phoneDigits,
        kind,
        what,
        awake: body.awake,
        who: body.who,
        whereMode: body.whereMode,
        whereText: body.whereText,
        whereLat: Number.isFinite(lat) ? lat : null,
        whereLng: Number.isFinite(lng) ? lng : null,
        building: body.building,
        room: body.room,
        landmark: body.landmark,
        placeId,
        desk: deskName,
        path,
        otherType: body.otherType,
        detail: body.detail,
        state,
        clientRef: clientRef || null,
      });
      if (saved.created) {
        const where = text(body.whereText) || "the place in the case";
        notifyDesk(pool, placeId, `AfriResQ ${saved.row.public_id}. ${what}. ${where}.`).catch((err) => {
          console.error("Desk SMS failed:", err.message);
        });
      }
      res.status(saved.created ? 201 : 200).json(fromRow(saved.row, false));
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
      const me = desk ? null : await personFromRequest(pool, req);
      const ownPhone = me?.phoneDigits === current.phone_digits;
      const ownDesk = desk?.place_id === current.place_id;
      if (!ownPhone && !ownDesk) {
        res.status(401).json({ error: "Sign in to see or change this case." });
        return;
      }
      if (state === "declined") {
        if (!ownDesk) {
          res.status(401).json({ error: "Sign in to this desk first." });
          return;
        }
        if (current.state !== "sent") {
          res.status(409).json({ error: "Only a new request can be declined. Close it instead." });
          return;
        }
        if (!text(body.reason)) {
          res.status(400).json({ error: "Say why this request is declined. The person sees the reason." });
          return;
        }
      }
      if (ownDesk && state && state !== current.state && FINISHED.has(current.state)) {
        res.status(409).json({ error: current.state === "declined" ? "This request was declined." : current.state === "cancelled" ? "The person cancelled this request." : "This case is closed." });
        return;
      }
      if (ownDesk && !ownPhone && state in DESK_ORDER && current.state in DESK_ORDER && DESK_ORDER[state] < DESK_ORDER[current.state]) {
        res.status(409).json({ error: "This case has already moved past that step." });
        return;
      }
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
           closed_at = case when $2 in ('closed', 'cancelled', 'declined') then coalesce(closed_at, now()) else closed_at end,
           decline_reason = case when $2 = 'declined' then $9 else decline_reason end,
           updated_at = now()
         where public_id = $1`,
        [req.params.id, state, body.rating != null && body.rating !== "", rating, hasPoint, hasPoint ? lat : null, hasPoint ? lng : null, text(body.whereText), text(body.reason).slice(0, 240)],
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
      // Case numbers count up, so anyone could guess one. Only the sender and the desk may open it.
      const desk = await deskFromRequest(pool, req);
      const ownDesk = desk?.place_id === row.place_id;
      const me = ownDesk ? null : await personFromRequest(pool, req);
      if (!ownDesk && me?.phoneDigits !== row.phone_digits) {
        res.status(404).json({ error: "No case is saved with that number." });
        return;
      }
      res.json(fromRow(row, ownDesk));
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
      } else {
        const me = await personFromRequest(pool, req);
        if (!me || me.phoneDigits !== (ugandaPhone(req.query.phone)?.national || phoneDigits)) {
          res.status(401).json({ error: "Sign in to see your cases." });
          return;
        }
      }
      const found = placeId
        ? await pool.query(
            `${CASE_SELECT}
             where c.place_id = $1
               and c.state ${closed ? "in ('closed', 'cancelled', 'declined')" : "not in ('closed', 'cancelled', 'declined')"}
             order by c.created_at ${closed ? "desc" : "asc"}
             ${closed ? "limit 100" : ""}`,
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
