import { Router } from "express";
import { bearer } from "./desks.js";
import { personFromRequest } from "./auth.js";
import { createHash } from "node:crypto";

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function domainOf(email) {
  const parts = String(email || "").trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

function messageRow(row, personId) {
  return {
    id: row.id,
    body: row.body,
    senderName: row.sender_name,
    mine: row.sender_kind === "person" && row.sender_id === personId,
    at: row.created_at,
  };
}

async function studentFromRequest(pool, req) {
  const who = await personFromRequest(pool, req);
  if (!who) return null;
  const found = await pool.query(
    "select id, person_type, name, email from people where phone_digits = $1",
    [who.phoneDigits],
  );
  const person = found.rows[0];
  if (!person || person.person_type !== "student") return null;
  return person;
}

async function groupForDomain(pool, domain) {
  if (!domain) return null;
  const found = await pool.query(
    `select g.id, g.name, p.organisation, p.student_domain
     from announcement_groups g
     join partner_applications p on p.id = g.partner_id
     where p.status = 'approved' and lower(p.student_domain) = $1
     order by g.created_at asc
     limit 1`,
    [domain],
  );
  return found.rows[0] || null;
}

async function messagesFor(pool, groupId, personId) {
  const found = await pool.query(
    `select id, body, sender_kind, sender_id, sender_name, created_at
     from announcement_messages
     where group_id = $1
     order by created_at asc
     limit 300`,
    [groupId],
  );
  return found.rows.map((row) => messageRow(row, personId));
}

async function partnerFromRequest(pool, req) {
  const token = bearer(req);
  if (!token) return null;
  const found = await pool.query(
    `select p.id, p.organisation, p.applicant_kind, p.student_domain, p.status
     from partner_sessions s
     join partner_applications p on p.id = s.partner_id
     where s.token_hash = $1 and s.expires_at > now() and p.status = 'approved'`,
    [tokenHash(token)],
  );
  return found.rows[0] || null;
}

async function groupForPartner(pool, partnerId) {
  const found = await pool.query(
    "select id, name from announcement_groups where partner_id = $1",
    [partnerId],
  );
  return found.rows[0] || null;
}

export function announcementRouter(pool) {
  const router = Router();

  router.get("/mine", async (req, res) => {
    try {
      const person = await studentFromRequest(pool, req);
      if (!person) {
        res.status(401).json({ error: "Sign in as a student first." });
        return;
      }
      const group = await groupForDomain(pool, domainOf(person.email));
      if (!group) {
        res.json({ group: null, admin: false, messages: [] });
        return;
      }
      const admin = await pool.query(
        "select 1 from announcement_admins where group_id = $1 and person_id = $2",
        [group.id, person.id],
      );
      res.json({
        group: { id: group.id, name: group.name, university: group.organisation },
        admin: Boolean(admin.rows[0]),
        messages: await messagesFor(pool, group.id, person.id),
      });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.post("/mine", async (req, res) => {
    try {
      const person = await studentFromRequest(pool, req);
      if (!person) {
        res.status(401).json({ error: "Sign in as a student first." });
        return;
      }
      const body = clean(req.body?.body, 2000);
      if (!body) {
        res.status(400).json({ error: "Write the message first." });
        return;
      }
      const group = await groupForDomain(pool, domainOf(person.email));
      if (!group) {
        res.status(404).json({ error: "This university has no announcement group." });
        return;
      }
      const admin = await pool.query(
        "select 1 from announcement_admins where group_id = $1 and person_id = $2",
        [group.id, person.id],
      );
      if (!admin.rows[0]) {
        res.status(403).json({ error: "Only an admin can send a message." });
        return;
      }
      await pool.query(
        `insert into announcement_messages (group_id, body, sender_kind, sender_id, sender_name)
         values ($1, $2, 'person', $3, $4)`,
        [group.id, body, person.id, person.name],
      );
      res.status(201).json({
        group: { id: group.id, name: group.name, university: group.organisation },
        admin: true,
        messages: await messagesFor(pool, group.id, person.id),
      });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.get("/desk", async (req, res) => {
    try {
      const partner = await partnerFromRequest(pool, req);
      if (!partner) {
        res.status(401).json({ error: "Sign in with the partner code first." });
        return;
      }
      const group = await groupForPartner(pool, partner.id);
      if (!group) {
        res.json({ group: null, messages: [], admins: [] });
        return;
      }
      const admins = await pool.query(
        `select p.id, p.name, p.email
         from announcement_admins a
         join people p on p.id = a.person_id
         where a.group_id = $1
         order by p.name`,
        [group.id],
      );
      res.json({
        group: { id: group.id, name: group.name },
        messages: await messagesFor(pool, group.id, ""),
        admins: admins.rows.map((row) => ({ id: row.id, name: row.name, email: row.email })),
      });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.post("/desk", async (req, res) => {
    try {
      const partner = await partnerFromRequest(pool, req);
      if (!partner) {
        res.status(401).json({ error: "Sign in with the partner code first." });
        return;
      }
      const body = clean(req.body?.body, 2000);
      if (!body) {
        res.status(400).json({ error: "Write the message first." });
        return;
      }
      const group = await groupForPartner(pool, partner.id);
      if (!group) {
        res.status(404).json({ error: "This university has no announcement group." });
        return;
      }
      await pool.query(
        `insert into announcement_messages (group_id, body, sender_kind, sender_id, sender_name)
         values ($1, $2, 'partner', $3, $4)`,
        [group.id, body, partner.id, partner.organisation],
      );
      res.status(201).json({ ok: true });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.post("/desk/admins", async (req, res) => {
    try {
      const partner = await partnerFromRequest(pool, req);
      if (!partner) {
        res.status(401).json({ error: "Sign in with the partner code first." });
        return;
      }
      const group = await groupForPartner(pool, partner.id);
      if (!group) {
        res.status(404).json({ error: "This university has no announcement group." });
        return;
      }
      const email = clean(req.body?.email, 160).toLowerCase();
      const domain = domainOf(email);
      if (!email || domain !== String(partner.student_domain || "").toLowerCase()) {
        res.status(400).json({ error: `Use a student email ending in @${partner.student_domain}.` });
        return;
      }
      const person = await pool.query(
        "select id, name, person_type from people where lower(email) = $1",
        [email],
      );
      const row = person.rows[0];
      if (!row || row.person_type !== "student") {
        res.status(404).json({ error: "No student on AfriResQ uses that email yet." });
        return;
      }
      await pool.query(
        `insert into announcement_admins (group_id, person_id) values ($1, $2)
         on conflict do nothing`,
        [group.id, row.id],
      );
      res.status(201).json({ id: row.id, name: row.name, email });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.delete("/desk/admins", async (req, res) => {
    try {
      const partner = await partnerFromRequest(pool, req);
      if (!partner) {
        res.status(401).json({ error: "Sign in with the partner code first." });
        return;
      }
      const group = await groupForPartner(pool, partner.id);
      if (!group) {
        res.status(404).json({ error: "This university has no announcement group." });
        return;
      }
      const personId = clean(req.body?.personId, 80);
      await pool.query(
        "delete from announcement_admins where group_id = $1 and person_id = $2",
        [group.id, personId],
      );
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  return router;
}
