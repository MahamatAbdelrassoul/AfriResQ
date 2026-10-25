import { Router } from "express";
import { personFromRequest } from "./auth.js";
import { forgetOldPlaces } from "./people.js";

const MAX_WAIT = 48 * 3600;

function waitSeconds(row) {
  const secs = Number(row?.safety_wait_secs);
  if (Number.isFinite(secs) && secs >= 1) return Math.min(MAX_WAIT, Math.round(secs));
  const mins = Number(row?.safety_wait_mins);
  if (Number.isFinite(mins) && mins >= 1) return Math.min(MAX_WAIT, Math.round(mins * 60));
  return 1800;
}

function chosenSeconds(body) {
  const secs = Number(body?.seconds);
  if (!Number.isFinite(secs)) return 0;
  return Math.min(MAX_WAIT, Math.max(1, Math.round(secs)));
}

async function meRow(pool, req) {
  const me = await personFromRequest(pool, req);
  if (!me) return null;
  const found = await pool.query("select * from people where phone_digits = $1", [me.phoneDigits]);
  return found.rows[0] || null;
}

async function openWaiting(pool) {
  await pool.query(
    `update safety_alerts
     set status = 'shared'
     where status = 'waiting'
       and started_at + make_interval(secs => coalesce(wait_secs, wait_mins * 60)) <= now()`,
  );
}

async function openDueClocks(pool, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;
  const due = await pool.query(
    `select id, kin_phone_digits, safety_wait_secs, safety_wait_mins, checkin_due_at, trip_due_at
     from people
     where id = any($1::uuid[])
       and ((checkin_due_at is not null and checkin_due_at <= now())
         or (trip_due_at is not null and trip_due_at <= now()))`,
    [unique],
  );
  for (const row of due.rows) {
    const kin = row.kin_phone_digits
      ? await pool.query(
        "select id from people where phone_digits = $1 and profile_done and id <> $2 limit 1",
        [row.kin_phone_digits, row.id],
      )
      : { rows: [] };
    const kinId = kin.rows[0]?.id || null;
    if (row.checkin_due_at && new Date(row.checkin_due_at).getTime() <= Date.now() + 5000) {
      let result = "no-kin";
      if (kinId) {
        const wait = waitSeconds(row);
        try {
          await pool.query(
            `insert into safety_alerts (person_id, kin_id, status, wait_mins, wait_secs, source, started_at)
             values ($1, $2, 'waiting', $3, $4, 'checkin', $5)`,
            [row.id, kinId, Math.max(1, Math.ceil(wait / 60)), wait, row.checkin_due_at],
          );
          result = "asking";
        } catch (err) {
          if (err.code !== "23505") throw err;
          result = "asking";
        }
      }
      await pool.query("update people set checkin_due_at = null, checkin_result = $2 where id = $1", [row.id, result]);
    }
    if (row.trip_due_at && new Date(row.trip_due_at).getTime() <= Date.now() + 5000) {
      let result = "no-kin";
      if (kinId) {
        const wait = waitSeconds(row);
        try {
          await pool.query(
            `insert into safety_alerts (person_id, kin_id, status, wait_mins, wait_secs, source, started_at)
             values ($1, $2, 'waiting', $3, $4, 'trip', $5)`,
            [row.id, kinId, Math.max(1, Math.ceil(wait / 60)), wait, row.trip_due_at],
          );
          result = "asking";
        } catch (err) {
          if (err.code !== "23505") throw err;
          result = "asking";
        }
      }
      await pool.query("update people set trip_due_at = null, trip_result = $2 where id = $1", [row.id, result]);
    }
  }
}

function decodePath(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function thinPath(points) {
  if (points.length <= 60) return points;
  const step = Math.ceil(points.length / 60);
  const kept = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

function walkMetres(fromLat, fromLng, toLat, toLng) {
  const rad = Math.PI / 180;
  const dLat = (toLat - fromLat) * rad;
  const dLng = (toLng - fromLng) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(fromLat * rad) * Math.cos(toLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function googlePoint(text) {
  const key = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!key || !text) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&components=country:UG&region=ug&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    const body = res.ok ? await res.json() : {};
    if (body.status !== "OK") return null;
    const place = body.results[0];
    return {
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
      label: place.formatted_address || text,
    };
  } catch {
    return null;
  }
}

const TRAVEL = {
  walk: { routes: "WALK", directions: "walking" },
  bike: { routes: "BICYCLE", directions: "bicycling" },
  car: { routes: "DRIVE", directions: "driving" },
};

function travelMode(value) {
  return TRAVEL[value] ? value : "walk";
}

function routeResult(encoded, seconds, metres) {
  const points = thinPath(decodePath(encoded || ""));
  if (points.length < 2) return null;
  return {
    points,
    seconds: Math.max(60, Math.round(Number(seconds) || 60)),
    metres: Math.max(0, Math.round(Number(metres) || 0)),
  };
}

async function routesTrip(key, mode, fromLat, fromLng, toLat, toLng) {
  const travel = TRAVEL[mode];
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: fromLat, longitude: fromLng } } },
      destination: { location: { latLng: { latitude: toLat, longitude: toLng } } },
      travelMode: travel.routes,
      regionCode: "UG",
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = res.ok ? await res.json() : {};
  const route = body.routes?.[0];
  return routeResult(route?.polyline?.encodedPolyline, String(route?.duration || "").replace(/s$/, ""), route?.distanceMeters);
}

async function googleTrip(mode, fromLat, fromLng, toLat, toLng) {
  const key = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!key) return null;
  const travel = TRAVEL[mode] || TRAVEL.walk;
  try {
    const routed = await routesTrip(key, mode, fromLat, fromLng, toLat, toLng);
    if (routed) return routed;
  } catch { /* the older directions call is the next try */ }
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&mode=${travel.directions}&region=ug&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const body = res.ok ? await res.json() : {};
    const leg = body.routes?.[0]?.legs?.[0];
    const encoded = body.routes?.[0]?.overview_polyline?.points;
    if (body.status !== "OK" || !leg || !encoded) return null;
    return routeResult(encoded, leg.duration?.value, leg.distance?.value);
  } catch {
    return null;
  }
}

function pathOf(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((point) => [Number(point.lat), Number(point.lng)])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function placeOf(row) {
  if (row.last_seen_at == null || row.last_lat == null) return null;
  return {
    lat: row.last_lat,
    lng: row.last_lng,
    battery: row.last_battery,
    at: row.last_seen_at,
  };
}

function clockOf(dueAt, result) {
  if (dueAt) return { dueAt, result: "" };
  if (result) return { dueAt: null, result };
  return null;
}

export function safetyRouter(pool) {
  const router = Router();

  router.get("/mine", async (req, res) => {
    try {
      const me = await meRow(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again." });
        return;
      }
      await forgetOldPlaces(pool);
      const watched = await pool.query(
        "select id from people where kin_phone_digits = $1 and id <> $2 and profile_done",
        [me.phone_digits, me.id],
      );
      await openDueClocks(pool, [me.id, ...watched.rows.map((row) => row.id)]);
      await openWaiting(pool);
      const fresh = await pool.query(
        "select checkin_due_at, checkin_result, trip_due_at, trip_result, trip_share from people where id = $1",
        [me.id],
      );
      const clock = fresh.rows[0] || {};
      const named = await pool.query(
        `select p.id, p.name, p.phone, p.kin_relation, p.safety_kin,
                p.last_lat, p.last_lng, p.last_battery, p.last_seen_at,
                p.trip_due_at, p.trip_dest_text, p.trip_dest_lat, p.trip_dest_lng, p.trip_path, p.trip_share,
                a.id as alert_id, a.status as alert_status, a.started_at, a.wait_mins, a.wait_secs, a.source
         from people p
         left join safety_alerts a on a.person_id = p.id and a.status in ('waiting', 'shared')
         where p.kin_phone_digits = $1 and p.id <> $2 and p.profile_done
         order by p.name`,
        [me.phone_digits, me.id],
      );
      const asked = await pool.query(
        `select a.id, a.started_at, a.wait_mins, a.wait_secs, a.source, k.name as kin_name
         from safety_alerts a
         join people k on k.id = a.kin_id
         where a.person_id = $1 and a.status = 'waiting'`,
        [me.id],
      );
      const own = await pool.query(
        `select status, source from safety_alerts
         where person_id = $1 and status in ('waiting', 'shared')
         order by started_at desc limit 1`,
        [me.id],
      );
      const ask = asked.rows[0];
      res.json({
        watching: named.rows.map((row) => {
          const shared = row.alert_status === "shared";
          const walking = row.trip_share && row.trip_due_at && new Date(row.trip_due_at).getTime() > Date.now();
          const trail = pathOf(row.trip_path);
          return {
            id: row.id,
            name: row.name,
            phone: row.phone,
            rel: row.kin_relation,
            allowed: row.safety_kin,
            live: walking
              ? {
                  dueAt: row.trip_due_at,
                  dest: row.trip_dest_text || "",
                  lat: row.trip_dest_lat,
                  lng: row.trip_dest_lng,
                  path: trail,
                }
              : null,
            alert: row.alert_id
              ? {
                  id: row.alert_id,
                  status: row.alert_status,
                  source: row.source || "kin",
                  startedAt: row.started_at,
                  waitSecs: row.wait_secs || (row.wait_mins || 0) * 60,
                  place: shared ? placeOf(row) : null,
                  path: row.source === "trip" ? trail : [],
                }
              : null,
          };
        }),
        asked: ask
          ? {
              id: ask.id,
              fromName: ask.kin_name,
              startedAt: ask.started_at,
              waitSecs: ask.wait_secs || (ask.wait_mins || 0) * 60,
              source: ask.source || "kin",
            }
          : null,
        own: own.rows[0] ? { status: own.rows[0].status, source: own.rows[0].source } : null,
        checkin: clockOf(clock.checkin_due_at, clock.checkin_result),
        trip: (() => {
          const clocked = clockOf(clock.trip_due_at, clock.trip_result);
          return clocked ? { ...clocked, share: Boolean(clock.trip_share) } : null;
        })(),
      });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.post("/checkin", async (req, res) => {
    try {
      const me = await meRow(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again." });
        return;
      }
      const seconds = chosenSeconds(req.body);
      if (!seconds) {
        res.status(400).json({ error: "Enter a time first." });
        return;
      }
      const saved = await pool.query(
        `update people
         set safety_wait_secs = $2, checkin_due_at = now() + make_interval(secs => $2), checkin_result = ''
         where id = $1
         returning checkin_due_at, safety_wait_secs`,
        [me.id, seconds],
      );
      res.status(201).json({ dueAt: saved.rows[0].checkin_due_at, waitSecs: saved.rows[0].safety_wait_secs });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.delete("/checkin", async (req, res) => {
    try {
      const me = await meRow(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again." });
        return;
      }
      await pool.query(
        `update safety_alerts
         set status = 'answered', answered_at = now()
         where person_id = $1 and source = 'checkin' and status = 'waiting'`,
        [me.id],
      );
      await pool.query("update people set checkin_due_at = null, checkin_result = '' where id = $1", [me.id]);
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.post("/route", async (req, res) => {
    try {
      const me = await meRow(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again." });
        return;
      }
      const fromLat = Number(req.body?.fromLat);
      const fromLng = Number(req.body?.fromLng);
      if (!Number.isFinite(fromLat) || !Number.isFinite(fromLng)) {
        res.status(400).json({ error: "The starting place is missing." });
        return;
      }
      let toLat = Number(req.body?.toLat);
      let toLng = Number(req.body?.toLng);
      let label = String(req.body?.toText || "").trim();
      if (!Number.isFinite(toLat) || !Number.isFinite(toLng)) {
        const found = await googlePoint(label);
        if (!found) {
          res.status(404).json({ error: "That place could not be found in Uganda." });
          return;
        }
        toLat = found.lat;
        toLng = found.lng;
        label = found.label;
      }
      const mode = travelMode(req.body?.mode);
      const drawn = await googleTrip(mode, fromLat, fromLng, toLat, toLng);
      if (!drawn?.points?.length || !drawn.seconds) {
        res.status(503).json({ error: "Google did not return the road for this trip." });
        return;
      }
      res.json({
        points: drawn.points,
        seconds: drawn.seconds,
        metres: drawn.metres || Math.round(walkMetres(fromLat, fromLng, toLat, toLng)),
        toLat,
        toLng,
        label,
        drawn: true,
        mode,
      });
    } catch {
      res.status(503).json({ error: "The path could not be drawn." });
    }
  });

  router.post("/trip", async (req, res) => {
    try {
      const me = await meRow(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again." });
        return;
      }
      const seconds = chosenSeconds(req.body);
      if (!seconds) {
        res.status(400).json({ error: "Enter a time first." });
        return;
      }
      const destText = String(req.body?.destText || "").trim().slice(0, 180);
      const destLat = Number(req.body?.destLat);
      const destLng = Number(req.body?.destLng);
      const share = req.body?.share === true;
      await pool.query(
        `update safety_alerts
         set status = 'answered', answered_at = now()
         where person_id = $1 and source = 'trip' and status in ('waiting', 'shared')`,
        [me.id],
      );
      const saved = await pool.query(
        `update people
         set trip_due_at = now() + make_interval(secs => $2),
             trip_result = '',
             trip_path = '[]'::jsonb,
             trip_dest_text = $3,
             trip_dest_lat = $4,
             trip_dest_lng = $5,
             trip_share = $6
         where id = $1
         returning trip_due_at`,
        [
          me.id,
          seconds,
          destText,
          Number.isFinite(destLat) ? destLat : null,
          Number.isFinite(destLng) ? destLng : null,
          share,
        ],
      );
      res.status(201).json({ dueAt: saved.rows[0].trip_due_at });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.delete("/trip", async (req, res) => {
    try {
      const me = await meRow(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again." });
        return;
      }
      await pool.query(
        `update safety_alerts
         set status = 'answered', answered_at = now()
         where person_id = $1 and source = 'trip' and status in ('waiting', 'shared')`,
        [me.id],
      );
      await pool.query(
        "update people set trip_due_at = null, trip_result = '', trip_share = false, trip_path = '[]'::jsonb, trip_dest_text = '', trip_dest_lat = null, trip_dest_lng = null where id = $1",
        [me.id],
      );
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.post("/alerts", async (req, res) => {
    try {
      const me = await meRow(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again." });
        return;
      }
      const person = await pool.query(
        "select id, safety_kin, safety_wait_mins, safety_wait_secs from people where id = $1 and kin_phone_digits = $2 and profile_done",
        [req.body?.personId, me.phone_digits],
      );
      const row = person.rows[0];
      if (!row) {
        res.status(404).json({ error: "That person has not named you as next of kin." });
        return;
      }
      if (!row.safety_kin) {
        res.status(403).json({ error: "They have not allowed an alert." });
        return;
      }
      const wait = waitSeconds(row);
      const saved = await pool.query(
        `insert into safety_alerts (person_id, kin_id, wait_mins, wait_secs, source)
         values ($1, $2, $3, $4, 'kin')
         returning id, started_at, wait_secs`,
        [row.id, me.id, Math.max(1, Math.ceil(wait / 60)), wait],
      );
      res.status(201).json({
        id: saved.rows[0].id,
        status: "waiting",
        startedAt: saved.rows[0].started_at,
        waitSecs: saved.rows[0].wait_secs,
      });
    } catch (err) {
      if (err.code === "23505") {
        res.status(409).json({ error: "An alert is already open for this person." });
        return;
      }
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.post("/alerts/:id/answer", async (req, res) => {
    try {
      const me = await meRow(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again." });
        return;
      }
      const saved = await pool.query(
        `update safety_alerts
         set status = 'answered', answered_at = now()
         where id = $1 and person_id = $2 and status in ('waiting', 'shared')
         returning id`,
        [req.params.id, me.id],
      );
      if (!saved.rows[0]) {
        res.status(404).json({ error: "That question is no longer open." });
        return;
      }
      await pool.query("update people set checkin_result = '' where id = $1 and checkin_result = 'asking'", [me.id]);
      await pool.query(
        `update people
         set trip_result = '', trip_share = false, trip_path = '[]'::jsonb,
             trip_dest_text = '', trip_dest_lat = null, trip_dest_lng = null
         where id = $1 and trip_result = 'asking'`,
        [me.id],
      );
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  return router;
}
