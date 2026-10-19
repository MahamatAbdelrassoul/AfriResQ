import { randomBytes } from "node:crypto";
import { Router } from "express";
import { bearer, codeMatches, hashCode } from "./desks.js";
import { ensurePartnerPlace, issuePartnerCode, partnerLocation, revokePartnerCode } from "./partners.js";

const STATE_LABEL = {
  sent: "Sent",
  accepted: "Accepted",
  on_the_way: "On the way",
  arrived: "Arrived",
  closed: "Closed",
  cancelled: "Cancelled",
  declined: "Declined",
};

const STATES = new Set(Object.keys(STATE_LABEL));
const PLACE_KINDS = new Set(["hospital", "police", "fire", "disaster"]);
const CASE_FILTERS = {
  open: "c.state not in ('closed', 'cancelled', 'declined')",
  waiting: "c.state = 'sent'",
  closed: "c.state = 'closed'",
  cancelled: "c.state = 'cancelled'",
  declined: "c.state = 'declined'",
  all: "true",
};
const PEOPLE_FILTERS = {
  all: "true",
  citizen: "p.person_type = 'citizen'",
  student: "p.person_type = 'student'",
  blocked: "p.blocked",
};

// The citizen app sends medical cases to mak and lists only these two desks at sign-in,
// so they cannot be removed or stop receiving until the app learns new desks.
const CORE_PLACES = new Set(["mak", "mps"]);

// A case still marked Sent after this long is shown as late on the team page.
const LATE_MINUTES = 5;

function adminCode() {
  return process.env.ADMIN_CODE || "905511";
}

function text(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
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

async function log(pool, action, target, detail = "") {
  await pool.query(
    "insert into admin_log (action, target, detail) values ($1, $2, $3)",
    [action, String(target || ""), String(detail || "")],
  );
}

function codeDetail(issued) {
  return issued.sentTo.length ? `sign-in code sent to ${issued.sentTo.join(", ")}` : "sign-in code could not be sent, shown to the team once";
}

// Each handler answers with its own message. Anything unexpected is a database problem.
function guarded(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "The database is not available." });
    }
  };
}

function placeFromRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    short: row.short_name,
    receives: row.receives,
    university: row.university,
    phone: row.phone,
    lat: Number(row.lat),
    lng: Number(row.lng),
    ambulanceMin: row.ambulance_min,
    open: row.open_count ?? 0,
    closed: row.closed_count ?? 0,
    total: row.total_count ?? 0,
    hasCode: Boolean(row.has_code),
    online: row.online_count ?? 0,
    core: CORE_PLACES.has(row.id),
  };
}

function placeInput(body, creating) {
  const id = text(body.id, 20).toLowerCase();
  const kind = text(body.kind);
  const name = text(body.name, 160);
  const short = text(body.short, 40);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const amb = body.ambulanceMin === "" || body.ambulanceMin == null ? null : Number(body.ambulanceMin);
  if (creating && !/^[a-z0-9-]{2,20}$/.test(id)) {
    return { error: "A place id is 2 to 20 small letters, numbers, or dashes, for example kcca-fire." };
  }
  if (!PLACE_KINDS.has(kind)) return { error: "Choose hospital, police, fire, or disaster." };
  if (!name || !short) return { error: "Enter the full name and a short name." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Enter the latitude and longitude, for example 0.3304 and 32.5701." };
  }
  if (amb != null && (!Number.isInteger(amb) || amb < 1 || amb > 240)) {
    return { error: "Ambulance minutes are a whole number from 1 to 240, or empty." };
  }
  return {
    id,
    values: {
      kind,
      name,
      short,
      receives: body.receives === true,
      university: text(body.university, 160),
      phone: text(body.phone, 40),
      lat,
      lng,
      amb,
    },
  };
}

const PLACE_SELECT = `
  select p.*,
    count(c.id) filter (where c.state not in ('closed', 'cancelled', 'declined'))::int as open_count,
    count(c.id) filter (where c.state = 'closed')::int as closed_count,
    count(c.id)::int as total_count,
    exists (select 1 from desk_codes d where d.place_id = p.id) as has_code,
    (select count(*) from desk_sessions s where s.place_id = p.id and s.expires_at > now())::int as online_count
  from places p
  left join cases c on c.place_id = p.id
`;

export function adminRouter(pool) {
  const router = Router();

  router.post("/session", guarded(async (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      res.status(400).json({ error: "Enter the team code." });
      return;
    }
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
    await pool.query("delete from admin_sessions where expires_at <= now()");
    await log(pool, "Team sign-in", "", "");
    res.json({ token });
  }));

  router.delete("/session", guarded(async (req, res) => {
    const token = bearer(req);
    if (token) await pool.query("delete from admin_sessions where token = $1", [token]);
    res.json({ ok: true });
  }));

  // Everything below needs the team code.
  router.use(guarded(async (req, res, next) => {
    if (!(await signedIn(pool, req))) {
      res.status(401).json({ error: "Sign in with the team code first." });
      return;
    }
    next();
  }));

  router.get("/overview", guarded(async (_req, res) => {
    const stats = await pool.query(
      `select
         (select count(*) from cases where state not in ('closed', 'cancelled', 'declined'))::int as open,
         (select count(*) from cases where state = 'sent')::int as waiting,
         (select count(*) from cases where state = 'sent'
            and created_at < now() - make_interval(mins => $1))::int as late,
         (select count(*) from cases
            where created_at >= (date_trunc('day', now() at time zone 'Africa/Kampala') at time zone 'Africa/Kampala'))::int as today,
         (select count(*) from cases where state = 'closed')::int as closed,
         (select count(*) from people)::int as people,
         (select count(*) from people where person_type = 'student')::int as students,
         (select count(*) from people where blocked)::int as blocked,
         (select count(*) from partner_applications where status = 'pending')::int as pending_partners,
         (select count(distinct place_id) from desk_sessions where expires_at > now())::int as desks_online,
         (select round(avg(rating)::numeric, 1) from cases where rating is not null)::float as rating`,
      [LATE_MINUTES],
    );
    const places = await pool.query(`${PLACE_SELECT} group by p.id order by p.receives desc, p.name`);
    const applications = await pool.query(
      `select * from partner_applications
       order by (status = 'pending') desc, created_at desc
       limit 100`,
    );
    res.json({
      stats: { ...stats.rows[0], lateMinutes: LATE_MINUTES },
      places: places.rows.map(placeFromRow),
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
        codeSentAt: row.code_sent_at,
        availability: row.availability,
        placeId: row.place_id || "",
        baseLat: row.base_lat,
        baseLng: row.base_lng,
        createdAt: row.created_at,
      })),
    });
  }));

  router.get("/cases", guarded(async (req, res) => {
    const filter = CASE_FILTERS[text(req.query.state)] ? text(req.query.state) : "open";
    const params = [];
    const where = [CASE_FILTERS[filter]];
    const place = text(req.query.place, 20);
    if (place) {
      params.push(place);
      where.push(`c.place_id = $${params.length}`);
    }
    const q = text(req.query.q, 80);
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
      const n = params.length;
      where.push(`(c.public_id ilike $${n} or p.name ilike $${n} or p.phone_digits ilike $${n} or c.what ilike $${n} or c.where_text ilike $${n})`);
    }
    const found = await pool.query(
      `select c.*, p.name as person_name, p.phone as person_phone, p.person_type, p.blocked,
         pl.short_name as place_short
       from cases c
       join people p on p.phone_digits = c.phone_digits
       left join places pl on pl.id = c.place_id
       where ${where.join(" and ")}
       order by (c.state = 'sent') desc, c.created_at desc
       limit 200`,
      params,
    );
    res.json(found.rows.map((row) => ({
      id: row.public_id,
      kind: row.kind,
      path: row.path,
      what: row.what,
      detail: row.detail,
      declineReason: row.decline_reason || "",
      awake: row.awake,
      state: row.state,
      stateLabel: STATE_LABEL[row.state] || row.state,
      place: row.place_id,
      placeShort: row.place_short || "",
      desk: row.desk,
      whereText: row.where_text,
      whereLat: row.where_lat == null ? null : Number(row.where_lat),
      whereLng: row.where_lng == null ? null : Number(row.where_lng),
      rating: row.rating,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      person: row.person_name,
      personType: row.person_type,
      phone: row.person_phone,
      phoneDigits: row.phone_digits,
      blocked: row.blocked,
    })));
  }));

  router.patch("/cases/:id", guarded(async (req, res) => {
    const state = req.body?.state == null ? "" : text(req.body.state);
    const placeId = req.body?.placeId == null ? "" : text(req.body.placeId, 20);
    if (!state && !placeId) {
      res.status(400).json({ error: "Choose a new state or a new place." });
      return;
    }
    if (state && !STATES.has(state)) {
      res.status(400).json({ error: "That case state is not one AfriResQ uses." });
      return;
    }
    if (placeId) {
      const place = await pool.query("select 1 from places where id = $1", [placeId]);
      if (!place.rows[0]) {
        res.status(404).json({ error: "That place is not saved." });
        return;
      }
    }
    const before = await pool.query("select state, place_id from cases where public_id = $1", [req.params.id]);
    if (!before.rows[0]) {
      res.status(404).json({ error: "No case is saved with that number." });
      return;
    }
    await pool.query(
      `update cases set
         state = coalesce(nullif($2, ''), state),
         place_id = coalesce(nullif($3, ''), place_id),
         closed_at = case
           when coalesce(nullif($2, ''), state) in ('closed', 'cancelled', 'declined') then coalesce(closed_at, now())
           else null
         end,
         updated_at = now()
       where public_id = $1`,
      [req.params.id, state, placeId],
    );
    const changes = [];
    if (state && state !== before.rows[0].state) {
      changes.push(`${STATE_LABEL[before.rows[0].state] || before.rows[0].state} → ${STATE_LABEL[state]}`);
    }
    if (placeId && placeId !== before.rows[0].place_id) {
      changes.push(`moved ${before.rows[0].place_id || "nowhere"} → ${placeId}`);
    }
    await log(pool, "Case changed", req.params.id, changes.join(", ") || "no change");
    res.json({ ok: true });
  }));

  router.get("/people", guarded(async (req, res) => {
    const filter = PEOPLE_FILTERS[text(req.query.filter)] ? text(req.query.filter) : "all";
    const params = [];
    const where = [PEOPLE_FILTERS[filter]];
    const q = text(req.query.q, 80);
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
      const n = params.length;
      where.push(`(p.name ilike $${n} or p.phone_digits ilike $${n} or p.email ilike $${n} or p.student_no ilike $${n})`);
    }
    // Medical details stay with the desks that receive a case. The team page does not need them.
    const found = await pool.query(
      `select p.phone, p.phone_digits, p.person_type, p.name, p.email, p.university, p.student_no, p.hall,
         p.profile_done, p.blocked, p.blocked_reason, p.created_at,
         count(c.id)::int as case_count,
         count(c.id) filter (where c.state = 'cancelled')::int as cancelled_count,
         max(c.created_at) as last_case_at
       from people p
       left join cases c on c.phone_digits = p.phone_digits
       where ${where.join(" and ")}
       group by p.id
       order by p.created_at desc
       limit 200`,
      params,
    );
    res.json(found.rows.map((row) => ({
      phone: row.phone,
      phoneDigits: row.phone_digits,
      type: row.person_type,
      name: row.name,
      email: row.email,
      university: row.university,
      studentNo: row.student_no,
      hall: row.hall,
      profileDone: row.profile_done,
      blocked: row.blocked,
      blockedReason: row.blocked_reason,
      createdAt: row.created_at,
      cases: row.case_count,
      cancelled: row.cancelled_count,
      lastCaseAt: row.last_case_at,
    })));
  }));

  router.patch("/people/:digits", guarded(async (req, res) => {
    if (typeof req.body?.blocked !== "boolean") {
      res.status(400).json({ error: "Say whether to block or unblock this number." });
      return;
    }
    const blocked = req.body.blocked;
    const reason = blocked ? text(req.body.reason, 240) : "";
    if (blocked && !reason) {
      res.status(400).json({ error: "Write why this number is blocked. The team will see it later." });
      return;
    }
    const saved = await pool.query(
      `update people set blocked = $2, blocked_reason = $3, updated_at = now()
       where phone_digits = $1
       returning name`,
      [req.params.digits, blocked, reason],
    );
    if (!saved.rows[0]) {
      res.status(404).json({ error: "No person is saved with that number." });
      return;
    }
    await log(pool, blocked ? "Number blocked" : "Number unblocked", `${saved.rows[0].name} · ${req.params.digits}`, reason);
    res.json({ ok: true, name: saved.rows[0].name });
  }));

  router.post("/places", guarded(async (req, res) => {
    const input = placeInput(req.body || {}, true);
    if (input.error) {
      res.status(400).json({ error: input.error });
      return;
    }
    const v = input.values;
    const saved = await pool.query(
      `insert into places (id, kind, name, short_name, receives, university, phone, lat, lng, distance_km, drive_min, ambulance_min)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, $10)
       on conflict (id) do nothing
       returning id`,
      [input.id, v.kind, v.name, v.short, v.receives, v.university, v.phone, v.lat, v.lng, v.amb],
    );
    if (!saved.rows[0]) {
      res.status(409).json({ error: "A place with that id already exists." });
      return;
    }
    await log(pool, "Place added", `${v.name} · ${input.id}`, v.receives ? "receives cases" : "listed only");
    res.status(201).json({ ok: true, id: input.id });
  }));

  router.patch("/places/:id", guarded(async (req, res) => {
    const input = placeInput(req.body || {}, false);
    if (input.error) {
      res.status(400).json({ error: input.error });
      return;
    }
    const v = input.values;
    if (CORE_PLACES.has(req.params.id) && !v.receives) {
      res.status(409).json({ error: "This desk is built into the AfriResQ app, so it keeps receiving cases." });
      return;
    }
    const saved = await pool.query(
      `update places set kind = $2, name = $3, short_name = $4, receives = $5, university = $6,
         phone = $7, lat = $8, lng = $9, ambulance_min = $10
       where id = $1
       returning id`,
      [req.params.id, v.kind, v.name, v.short, v.receives, v.university, v.phone, v.lat, v.lng, v.amb],
    );
    if (!saved.rows[0]) {
      res.status(404).json({ error: "That place is not saved." });
      return;
    }
    // A partner on this place stays connected but is paused until receiving is turned back on.
    if (!v.receives) await pool.query("delete from desk_sessions where place_id = $1", [req.params.id]);
    await log(pool, "Place changed", `${v.name} · ${req.params.id}`, v.receives ? "receives cases" : "listed only");
    res.json({ ok: true });
  }));

  router.delete("/places/:id", guarded(async (req, res) => {
    if (CORE_PLACES.has(req.params.id)) {
      res.status(409).json({ error: "This desk is built into the AfriResQ app, so it cannot be removed." });
      return;
    }
    const used = await pool.query("select count(*)::int as n from cases where place_id = $1", [req.params.id]);
    if (used.rows[0].n > 0) {
      res.status(409).json({ error: `This place has ${used.rows[0].n} case(s), so it stays for the record. Turn off receiving instead.` });
      return;
    }
    await pool.query("delete from desk_sessions where place_id = $1", [req.params.id]);
    await pool.query("delete from desk_codes where place_id = $1", [req.params.id]);
    await pool.query("update partner_applications set place_id = null where place_id = $1", [req.params.id]);
    const gone = await pool.query("delete from places where id = $1 returning name", [req.params.id]);
    if (!gone.rows[0]) {
      res.status(404).json({ error: "That place is not saved." });
      return;
    }
    await log(pool, "Place removed", `${gone.rows[0].name} · ${req.params.id}`);
    res.json({ ok: true });
  }));

  router.patch("/partners/:id", guarded(async (req, res) => {
    const status = String(req.body?.status || "");
    if (status !== "approved" && status !== "declined" && status !== "pending") {
      res.status(400).json({ error: "Confirm or decline the request." });
      return;
    }
    // A confirmed partner gets its own place at once, so it needs a map point before anything changes.
    let location = null;
    if (status === "approved") {
      const current = await pool.query(
        `select p.place_id, pl.id as existing from partner_applications p
         left join places pl on pl.id = p.place_id where p.id = $1`,
        [req.params.id],
      );
      if (!current.rows[0]) {
        res.status(404).json({ error: "That request is not saved." });
        return;
      }
      if (!current.rows[0].existing) {
        location = await partnerLocation(pool, req.params.id, req.body || {});
        if (!location) {
          res.status(409).json({ needsLocation: true, error: "AfriResQ could not find this partner on the map. Enter its latitude and longitude to confirm it." });
          return;
        }
      }
    }
    const saved = await pool.query(
      `update partner_applications
       set status = $2, updated_at = now()
       where id = $1
       returning organisation, status`,
      [req.params.id, status],
    );
    if (!saved.rows[0]) {
      res.status(404).json({ error: "That request is not saved." });
      return;
    }
    const { organisation } = saved.rows[0];
    const label = { approved: "Partner confirmed", declined: "Partner declined", pending: "Partner reopened" }[status];
    if (status !== "approved") {
      await revokePartnerCode(pool, req.params.id, status === "declined");
      await log(pool, label, organisation, "sign-in code cancelled, place paused");
      res.json({ ok: true, organisation, status });
      return;
    }
    const place = await ensurePartnerPlace(pool, req.params.id, location);
    const issued = await issuePartnerCode(pool, req.params.id);
    await log(pool, label, organisation, `${place.created ? `place ${place.placeId} created` : `place ${place.placeId} receiving again`}, ${codeDetail(issued)}`);
    res.json({ ok: true, organisation, status, placeId: place.placeId, placeCreated: place.created, located: location?.source || "", sentTo: issued.sentTo, code: issued.code });
  }));

  // A partner confirmed before places were automatic: create its place now.
  router.post("/partners/:id/place", guarded(async (req, res) => {
    const current = await pool.query("select status, place_id from partner_applications where id = $1", [req.params.id]);
    if (current.rows[0]?.status !== "approved") {
      res.status(409).json({ error: "Confirm this partner first." });
      return;
    }
    const location = await partnerLocation(pool, req.params.id, req.body || {});
    if (!location) {
      res.status(409).json({ needsLocation: true, error: "AfriResQ could not find this partner on the map. Enter its latitude and longitude." });
      return;
    }
    const place = await ensurePartnerPlace(pool, req.params.id, current.rows[0].place_id ? null : location);
    if (!place) {
      res.status(409).json({ needsLocation: true, error: "Enter the partner's latitude and longitude." });
      return;
    }
    const name = await pool.query("select organisation from partner_applications where id = $1", [req.params.id]);
    await log(pool, "Partner place created", name.rows[0].organisation, place.placeId);
    res.json({ ok: true, placeId: place.placeId, located: location.source });
  }));

  // Pause stops new work without losing anything: the place stops receiving and sessions end.
  router.patch("/partners/:id/active", guarded(async (req, res) => {
    const active = req.body?.active === true;
    const found = await pool.query(
      "select organisation, place_id from partner_applications where id = $1 and status = 'approved'",
      [req.params.id],
    );
    const row = found.rows[0];
    if (!row?.place_id) {
      res.status(409).json({ error: "This partner has no place yet." });
      return;
    }
    await pool.query("update places set receives = $2 where id = $1", [row.place_id, active]);
    if (!active) await pool.query("delete from desk_sessions where place_id = $1", [row.place_id]);
    await log(pool, active ? "Partner resumed" : "Partner paused", row.organisation, row.place_id);
    res.json({ ok: true, organisation: row.organisation, active });
  }));

  // Connect a confirmed partner to a place that receives cases. Its dashboard then works that place's cases.
  router.patch("/partners/:id/place", guarded(async (req, res) => {
    const placeId = text(req.body?.placeId, 20);
    if (placeId) {
      const place = await pool.query("select name, receives from places where id = $1", [placeId]);
      if (!place.rows[0]?.receives) {
        res.status(409).json({ error: "Choose a place that receives cases. Turn on receiving under Places first." });
        return;
      }
      const taken = await pool.query(
        "select organisation from partner_applications where place_id = $1 and id <> $2",
        [placeId, req.params.id],
      );
      if (taken.rows[0]) {
        res.status(409).json({ error: `${taken.rows[0].organisation} already works this place.` });
        return;
      }
    }
    const saved = await pool.query(
      `update partner_applications p set place_id = $2, updated_at = now()
       where p.id = $1 and p.status = 'approved'
       returning organisation, (select name from places where id = $2) as place_name`,
      [req.params.id, placeId || null],
    );
    if (!saved.rows[0]) {
      res.status(409).json({ error: "Confirm this partner before connecting it to a place." });
      return;
    }
    const { organisation, place_name: placeName } = saved.rows[0];
    await log(pool, placeId ? "Partner connected" : "Partner disconnected", organisation, placeName || "");
    res.json({ ok: true, organisation, placeName: placeName || "" });
  }));

  router.post("/partners/:id/code", guarded(async (req, res) => {
    const issued = await issuePartnerCode(pool, req.params.id);
    if (!issued) {
      res.status(409).json({ error: "Confirm this partner before sending a code." });
      return;
    }
    await log(pool, "Partner code sent", issued.organisation, codeDetail(issued));
    res.json({ ok: true, organisation: issued.organisation, sentTo: issued.sentTo, code: issued.code });
  }));

  router.patch("/desks/:placeId", guarded(async (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!/^\d{4,8}$/.test(code)) {
      res.status(400).json({ error: "A desk code is 4 to 8 digits." });
      return;
    }
    const place = await pool.query("select id, name, receives from places where id = $1", [req.params.placeId]);
    if (!place.rows[0]?.receives) {
      res.status(404).json({ error: "Turn on receiving for this place before giving it a desk code." });
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
    await log(pool, "Desk code changed", place.rows[0].name, "everyone at this desk was signed out");
    res.json({ ok: true, name: place.rows[0].name });
  }));

  router.delete("/desks/:placeId/sessions", guarded(async (req, res) => {
    const gone = await pool.query("delete from desk_sessions where place_id = $1", [req.params.placeId]);
    await log(pool, "Desk signed out", req.params.placeId, `${gone.rowCount} session(s) ended`);
    res.json({ ok: true, ended: gone.rowCount });
  }));

  router.patch("/team-code", guarded(async (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!/^\d{6,12}$/.test(code)) {
      res.status(400).json({ error: "The team code is 6 to 12 digits." });
      return;
    }
    await pool.query("update admin_gate set code_hash = $1, updated_at = now() where id = true", [hashCode(code)]);
    const gone = await pool.query("delete from admin_sessions where token <> $1", [bearer(req)]);
    await log(pool, "Team code changed", "", `${gone.rowCount} other team session(s) ended`);
    res.json({ ok: true, ended: gone.rowCount });
  }));

  router.get("/log", guarded(async (_req, res) => {
    const found = await pool.query("select * from admin_log order by created_at desc limit 200");
    res.json(found.rows.map((row) => ({
      id: Number(row.id),
      action: row.action,
      target: row.target,
      detail: row.detail,
      at: row.created_at,
    })));
  }));

  return router;
}
