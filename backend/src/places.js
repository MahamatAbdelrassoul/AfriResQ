import { Router } from "express";

const KINDS = new Set(["hospital", "police", "fire", "disaster"]);

// Until real driving routes arrive, a trip is the straight line, made longer for
// the roads, at an average Kampala speed. The ambulance also needs time to leave.
const ROAD_FACTOR = 1.4;
const CITY_KMH = 25;
const AMBULANCE_START_MIN = 2;

function driveMinutes(km) {
  return Math.max(1, Math.ceil(((km * ROAD_FACTOR) / CITY_KMH) * 60));
}

function fromRow(row) {
  const measured = row.measured_km != null;
  const dist = measured ? Math.round(Number(row.measured_km) * 10) / 10 : Number(row.distance_km);
  const drive = measured ? driveMinutes(Number(row.measured_km)) : row.drive_min;
  const amb = row.ambulance_min == null ? null : measured ? drive + AMBULANCE_START_MIN : row.ambulance_min;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    short: row.short_name,
    dist,
    drive,
    amb,
    conn: row.receives,
    uni: row.university,
    ll: [Number(row.lat), Number(row.lng)],
    phone: row.phone,
  };
}

export function placesRouter(pool) {
  const router = Router();

  router.get("/", async (req, res) => {
    const kind = String(req.query.kind || "").trim();
    if (kind && !KINDS.has(kind)) {
      res.status(400).json({ error: "That place kind is not one AfriResQ uses." });
      return;
    }
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasPoint = req.query.lat != null && req.query.lng != null
      && Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    try {
      const params = [];
      let select = "select *";
      let order = "order by distance_km";
      if (hasPoint) {
        params.push(lng, lat);
        const point = "st_setsrid(st_makepoint($1, $2), 4326)::geography";
        select = `select *, st_distance(location, ${point}) / 1000 as measured_km`;
        order = `order by location <-> ${point}`;
      }
      let where = "";
      if (kind) {
        params.push(kind);
        where = `where kind = $${params.length}`;
      }
      const found = await pool.query(`${select} from places ${where} ${order}`, params);
      res.json(found.rows.map(fromRow));
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  return router;
}
