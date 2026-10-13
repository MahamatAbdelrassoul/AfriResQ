import { Router } from "express";

const KINDS = new Set(["hospital", "police", "fire", "disaster"]);

function fromRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    short: row.short_name,
    dist: Number(row.distance_km),
    drive: row.drive_min,
    amb: row.ambulance_min,
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
    try {
      const found = kind
        ? await pool.query("select * from places where kind = $1 order by distance_km", [kind])
        : await pool.query("select * from places order by distance_km");
      res.json(found.rows.map(fromRow));
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  return router;
}
