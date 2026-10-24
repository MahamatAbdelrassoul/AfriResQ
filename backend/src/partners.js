import { createHash, randomBytes, randomInt } from "node:crypto";
import { Router } from "express";
import { ugandaPhone } from "./auth.js";
import { bearer, codeMatches, hashCode, placeStats } from "./desks.js";
import { sendMail } from "./mail.js";
import { PARTNER_CATEGORIES } from "./partner-categories.js";
import { sendSms } from "./ugsms.js";

const CATEGORIES = new Set(PARTNER_CATEGORIES);
const AVAILABILITY = new Set(["available", "busy", "unavailable"]);
const SESSION_TTL = "12 hours";
const MAX_TRIES = 5;
const LOCK_TIME = "15 minutes";

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

// A new sign-in code for a confirmed partner. The old code and every open session stop working.
// It goes to the official email and by SMS to the representative. When neither arrives,
// the code comes back to the team page once, so someone can pass it on by phone.
export async function issuePartnerCode(pool, id) {
  const code = String(randomInt(0, 100000000)).padStart(8, "0");
  const saved = await pool.query(
    `update partner_applications
     set access_code_hash = $2, code_sent_at = now(), failed_logins = 0, locked_until = null
     where id = $1 and status = 'approved'
     returning organisation, email, representative_phone, representative_email`,
    [id, hashCode(code)],
  );
  const row = saved.rows[0];
  if (!row) return null;
  await pool.query("delete from partner_sessions where partner_id = $1", [id]);

  const message = `${row.organisation} is confirmed on AfriResQ. Sign in to the partner dashboard with ${row.email} and this code: ${code}. Keep it private.`;
  const sentTo = [];
  const emails = [...new Set([row.email, row.representative_email].map((item) => item.trim().toLowerCase()).filter(Boolean))];
  for (const email of emails) {
    try {
      await sendMail(email, "Your AfriResQ partner code", message);
      sentTo.push(email);
    } catch (err) {
      console.error(`Partner code email to ${email} failed:`, err.message);
    }
  }
  const phone = ugandaPhone(row.representative_phone);
  if (phone) {
    try {
      await sendSms(phone.local, message);
      sentTo.push(`+256 ${phone.national}`);
    } catch (err) {
      console.error("Partner code SMS failed:", err.message);
    }
  }
  return { organisation: row.organisation, sentTo, code: sentTo.length ? "" : code };
}

// The kind of place a partner gets on the map, from its main service.
const PLACE_KIND = {
  "Ambulance and emergency medical services": "hospital",
  "Hospitals and emergency departments": "hospital",
  "Specialised medical response": "hospital",
  "First aid and community health response": "hospital",
  "Public health and disease outbreak response": "hospital",
  "Veterinary and animal emergencies": "hospital",
  "Police and law enforcement": "police",
  "Private security and guarding": "police",
  "Personal safety and protection": "police",
  "Fire and rescue services": "fire",
  "Hazardous materials and environmental emergencies": "fire",
  "Gas, fuel and energy emergencies": "fire",
  "Electricity and power emergencies": "fire",
  "Building and structural emergencies": "fire",
};
const AMBULANCE = "Ambulance and emergency medical services";
const AMBULANCE_MINUTES = 10;

export function inRange(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

// The address on the request, looked up with the Google Geocoding API. Only used when the partner gave
// no map point. Without GOOGLE_MAPS_API_KEY, or when Google finds nothing, the team types the point.
async function geocode(row) {
  const key = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!key) {
    console.error("Finding partners from their address needs GOOGLE_MAPS_API_KEY in backend/.env, with the Geocoding API turned on.");
    return null;
  }
  const address = [row.address, row.city, row.districts].filter(Boolean).join(", ");
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:UG&region=ug&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    const body = res.ok ? await res.json() : {};
    if (body.status !== "OK") {
      if (body.status !== "ZERO_RESULTS") console.error("Google Geocoding:", body.status, body.error_message || "");
      return null;
    }
    const { lat, lng } = body.results[0].geometry.location;
    return inRange(lat, lng) ? { lat, lng } : null;
  } catch (err) {
    console.error("Google Geocoding did not answer:", err.message);
    return null;
  }
}

async function freePlaceId(pool, organisation) {
  const base = String(organisation || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16).replace(/-+$/, "") || "partner";
  const stem = base.length < 2 ? `partner-${base}` : base;
  for (let n = 1; n < 100; n += 1) {
    const id = n === 1 ? stem : `${stem}-${n}`;
    const taken = await pool.query("select 1 from places where id = $1", [id]);
    if (!taken.rows[0]) return id;
  }
  return `p-${randomBytes(4).toString("hex")}`;
}

// The map point for a partner: the one the team typed, else the one on the request, else its address.
export async function partnerLocation(pool, id, override = {}) {
  const found = await pool.query("select * from partner_applications where id = $1", [id]);
  const row = found.rows[0];
  if (!row) return null;
  const lat = Number(override.lat);
  const lng = Number(override.lng);
  if (override.lat != null && override.lat !== "" && inRange(lat, lng)) return { lat, lng, source: "team" };
  if (row.base_lat != null && inRange(Number(row.base_lat), Number(row.base_lng))) {
    return { lat: Number(row.base_lat), lng: Number(row.base_lng), source: "request" };
  }
  const looked = await geocode(row);
  return looked ? { ...looked, source: "address" } : null;
}

// Every confirmed partner works its own place. Its first confirmation creates the place and connects it;
// later ones turn receiving back on. Returns null when there is no map point to put a new place on.
export async function ensurePartnerPlace(pool, id, location) {
  const found = await pool.query(
    `select p.*, pl.id as existing_place from partner_applications p
     left join places pl on pl.id = p.place_id
     where p.id = $1`,
    [id],
  );
  const row = found.rows[0];
  if (!row) return null;
  if (row.existing_place) {
    await pool.query("update places set receives = true where id = $1", [row.existing_place]);
    return { placeId: row.existing_place, created: false };
  }
  if (!location) return null;
  const placeId = await freePlaceId(pool, row.organisation);
  const categories = [row.primary_category, ...(row.extra_categories || [])];
  await pool.query(
    `insert into places (id, kind, name, short_name, receives, university, phone, lat, lng, distance_km, drive_min, ambulance_min)
     values ($1, $2, $3, $4, true, '', $5, $6, $7, 0, 0, $8)`,
    [
      placeId,
      PLACE_KIND[row.primary_category] || "disaster",
      row.organisation.slice(0, 160),
      row.organisation.slice(0, 40),
      row.phone ? `+256 ${row.phone.replace(/^\+?256\s*/, "")}` : "",
      location.lat,
      location.lng,
      categories.includes(AMBULANCE) ? AMBULANCE_MINUTES : null,
    ],
  );
  await pool.query(
    "update partner_applications set place_id = $2, base_lat = $3, base_lng = $4, updated_at = now() where id = $1",
    [id, placeId, location.lat, location.lng],
  );
  return { placeId, created: true };
}

// Waiting again or declined: the code and every session stop working, and the place stops receiving.
// A declined partner's place leaves the map too, unless cases were already sent to it.
export async function revokePartnerCode(pool, id, declined = false) {
  const found = await pool.query(
    "update partner_applications set access_code_hash = '' where id = $1 returning place_id",
    [id],
  );
  await pool.query("delete from partner_sessions where partner_id = $1", [id]);
  const placeId = found.rows[0]?.place_id;
  if (!placeId) return;
  await pool.query("update places set receives = false where id = $1", [placeId]);
  if (!declined) return;
  const used = await pool.query("select 1 from cases where place_id = $1 limit 1", [placeId]);
  if (used.rows[0]) return;
  await pool.query("update partner_applications set place_id = null where id = $1", [id]);
  await pool.query("delete from desk_codes where place_id = $1", [placeId]);
  await pool.query("delete from places where id = $1", [placeId]);
}

function dashboardFromRow(row) {
  return {
    id: row.id,
    organisation: row.organisation,
    applicantKind: row.applicant_kind || "organisation",
    city: row.city || "",
    studentDomain: row.student_domain || "",
    primaryCategory: row.primary_category,
    extraCategories: row.extra_categories || [],
    phone: row.phone,
    email: row.email,
    address: row.address,
    districts: row.districts,
    services: row.services,
    hours: row.hours,
    emergencyReady: row.emergency_ready,
    representativeName: row.representative_name,
    representativePhone: row.representative_phone,
    availability: row.availability,
    placeId: row.place_id || "",
    placeName: row.place_name || "",
    placeActive: Boolean(row.place_id && row.place_receives),
  };
}

const PARTNER_SELECT = `
  select p.*, pl.name as place_name, pl.receives as place_receives
  from partner_applications p
  left join places pl on pl.id = p.place_id
`;

// What a partner may change about itself. The name, the login email, the services, and the
// licence were checked by the team, so only the team changes those.
const EDITABLE = {
  phone: ["phone", 40],
  address: ["address", 240],
  districts: ["districts", 240],
  services: ["services", 500],
  hours: ["hours", 240],
  representativeName: ["representative_name", 160],
  representativePhone: ["representative_phone", 40],
  representativeEmail: ["representative_email", 160],
};
const REQUIRED = new Set(["phone", "address", "representativeName", "representativePhone"]);

async function dashboard(pool, id) {
  const found = await pool.query(`${PARTNER_SELECT} where p.id = $1`, [id]);
  const row = found.rows[0];
  return { ...dashboardFromRow(row), stats: await placeStats(pool, row.place_id) };
}

async function partnerFromRequest(pool, req) {
  const token = bearer(req);
  if (!token) return null;
  const found = await pool.query(
    `select p.id from partner_sessions s
     join partner_applications p on p.id = s.partner_id
     where s.token_hash = $1 and s.expires_at > now() and p.status = 'approved'`,
    [tokenHash(token)],
  );
  return found.rows[0] || null;
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

export function partnerRouter(pool) {
  const router = Router();

  router.post("/", async (req, res) => {
    const body = req.body || {};
    const organisation = clean(body.organisation, 160);
    const university = body.applicantKind === "university";
    const primary = university ? "University" : clean(body.primaryCategory, 120);
    const city = clean(body.city, 80);
    const studentDomain = clean(body.studentDomain, 80).toLowerCase().replace(/^@/, "");
    const domainOk = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(studentDomain) && !studentDomain.includes("..");
    const extras = Array.isArray(body.extraCategories)
      ? [...new Set(body.extraCategories.map((item) => clean(item, 120)).filter((item) => item && item !== primary && CATEGORIES.has(item)))]
      : [];
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 160);
    const address = clean(body.address, 240);
    const districts = clean(body.districts, 240);
    const services = clean(body.services, 500);
    const hours = clean(body.hours, 240);
    const licence = clean(body.licence, 240);
    const representativeName = clean(body.representativeName, 160);
    const representativePhone = clean(body.representativePhone, 40);
    const representativeEmail = clean(body.representativeEmail, 160);
    const baseLat = Number(body.baseLat);
    const baseLng = Number(body.baseLng);
    const hasBase = body.baseLat != null && body.baseLat !== "" && body.baseLng != null && body.baseLng !== ""
      && inRange(baseLat, baseLng);
    if (!organisation || !phone || !email || !address || !representativeName || !representativePhone || (university ? !city || !domainOk : !CATEGORIES.has(primary))) {
      res.status(400).json({
        error: university
          ? "Fill in the university, the city, the student email domain, the phone, the email, the address, and the person who can speak for it."
          : "Fill in the organisation, the main service, the phone, the email, the address, and the person who can speak for it.",
      });
      return;
    }
    try {
      const saved = await pool.query(
        `insert into partner_applications (
           organisation, primary_category, extra_categories, phone, email, address, districts,
           services, hours, emergency_ready, licence, representative_name, representative_phone, representative_email,
           base_lat, base_lng, applicant_kind, city, student_domain
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         returning id, status`,
        [
          organisation,
          primary,
          extras,
          phone,
          email,
          address,
          districts,
          services,
          hours,
          Boolean(body.emergencyReady),
          licence,
          representativeName,
          representativePhone,
          representativeEmail,
          hasBase ? baseLat : null,
          hasBase ? baseLng : null,
          university ? "university" : "organisation",
          university ? city : "",
          university && domainOk ? studentDomain : "",
        ],
      );
      res.status(201).json({ id: saved.rows[0].id, status: saved.rows[0].status });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.post("/session", async (req, res) => {
    const email = clean(req.body?.email, 160).toLowerCase();
    const code = String(req.body?.code || "").replace(/\s/g, "");
    if (!email || !code) {
      res.status(400).json({ error: "Enter the official email and the code AfriResQ sent." });
      return;
    }
    try {
      const found = await pool.query(
        `select * from partner_applications
         where lower(email) = $1 and status = 'approved' and access_code_hash <> ''
         order by updated_at desc limit 5`,
        [email],
      );
      if (!found.rows.length) {
        res.status(401).json({ error: "That email or code is not right." });
        return;
      }
      const open = found.rows.filter((row) => !row.locked_until || new Date(row.locked_until) <= new Date());
      if (!open.length) {
        res.status(429).json({ error: "Too many wrong codes. Wait 15 minutes, or ask AfriResQ for a new code." });
        return;
      }
      const row = open.find((item) => codeMatches(code, item.access_code_hash));
      if (!row) {
        await pool.query(
          `update partner_applications set
             failed_logins = case when failed_logins + 1 >= $2 then 0 else failed_logins + 1 end,
             locked_until = case when failed_logins + 1 >= $2 then now() + interval '${LOCK_TIME}' else locked_until end
           where id = any($1)`,
          [open.map((item) => item.id), MAX_TRIES],
        );
        res.status(401).json({ error: "That email or code is not right." });
        return;
      }
      const token = randomBytes(32).toString("hex");
      await pool.query("update partner_applications set failed_logins = 0, locked_until = null where id = $1", [row.id]);
      await pool.query(
        `insert into partner_sessions (token_hash, partner_id, expires_at)
         values ($1, $2, now() + interval '${SESSION_TTL}')`,
        [tokenHash(token), row.id],
      );
      res.json({ token, partner: await dashboard(pool, row.id) });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.get("/me", async (req, res) => {
    try {
      const row = await partnerFromRequest(pool, req);
      if (!row) {
        res.status(401).json({ error: "Sign in with the partner code first." });
        return;
      }
      res.json(await dashboard(pool, row.id));
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.patch("/me", async (req, res) => {
    const body = req.body || {};
    const sets = [];
    const values = [];
    if (body.availability !== undefined) {
      if (!AVAILABILITY.has(String(body.availability))) {
        res.status(400).json({ error: "Choose available, busy, or unavailable." });
        return;
      }
      values.push(String(body.availability));
      sets.push(`availability = $${values.length + 1}`);
    }
    for (const [key, [column, max]] of Object.entries(EDITABLE)) {
      if (body[key] === undefined) continue;
      const value = clean(body[key], max);
      if (REQUIRED.has(key) && !value) {
        res.status(400).json({ error: "The telephone, the address, and the representative's name and phone cannot be empty." });
        return;
      }
      values.push(value);
      sets.push(`${column} = $${values.length + 1}`);
    }
    if (body.emergencyReady !== undefined) {
      values.push(Boolean(body.emergencyReady));
      sets.push(`emergency_ready = $${values.length + 1}`);
    }
    if (!sets.length) {
      res.status(400).json({ error: "Nothing to change." });
      return;
    }
    try {
      const row = await partnerFromRequest(pool, req);
      if (!row) {
        res.status(401).json({ error: "Sign in with the partner code first." });
        return;
      }
      const saved = await pool.query(
        `update partner_applications set ${sets.join(", ")}, updated_at = now() where id = $1 returning organisation`,
        [row.id, ...values],
      );
      const details = Object.keys(body).filter((key) => key !== "availability");
      if (details.length) {
        await pool.query(
          "insert into admin_log (action, target, detail) values ($1, $2, $3)",
          ["Partner changed its details", saved.rows[0].organisation, details.join(", ")],
        );
      }
      res.json(await dashboard(pool, row.id));
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  // Every device signed in as this partner, including this one.
  router.delete("/sessions", async (req, res) => {
    try {
      const row = await partnerFromRequest(pool, req);
      if (!row) {
        res.status(401).json({ error: "Sign in with the partner code first." });
        return;
      }
      const gone = await pool.query("delete from partner_sessions where partner_id = $1", [row.id]);
      res.json({ ok: true, ended: gone.rowCount });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.delete("/session", async (req, res) => {
    const token = bearer(req);
    try {
      if (token) await pool.query("delete from partner_sessions where token_hash = $1", [tokenHash(token)]);
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  return router;
}
