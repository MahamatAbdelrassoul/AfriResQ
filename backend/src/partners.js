import { Router } from "express";
import { PARTNER_CATEGORIES } from "./partner-categories.js";

const CATEGORIES = new Set(PARTNER_CATEGORIES);

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

export function partnerRouter(pool) {
  const router = Router();

  router.post("/", async (req, res) => {
    const body = req.body || {};
    const organisation = clean(body.organisation, 160);
    const primary = clean(body.primaryCategory, 120);
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
    if (!organisation || !CATEGORIES.has(primary) || !phone || !email || !address || !representativeName || !representativePhone) {
      res.status(400).json({ error: "Fill in the organisation, the main service, the phone, the email, the address, and the person who can speak for it." });
      return;
    }
    try {
      const saved = await pool.query(
        `insert into partner_applications (
           organisation, primary_category, extra_categories, phone, email, address, districts,
           services, hours, emergency_ready, licence, representative_name, representative_phone, representative_email
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
        ],
      );
      res.status(201).json({ id: saved.rows[0].id, status: saved.rows[0].status });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  return router;
}
