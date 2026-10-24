import { Router } from "express";
import { authSession, isStudentEmail, PASSWORD_MIN, personFromRequest, sessionToken, ugandaPhone } from "./auth.js";
import { hashCode } from "./desks.js";

function digits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function text(value) {
  return String(value || "").trim();
}

function toRow(body) {
  const user = body?.user || {};
  const safety = body?.safety || {};
  const phone = ugandaPhone(user.phone);
  const personType = user.type === "student" ? "student" : user.type === "citizen" ? "citizen" : "";
  const name = text(user.name);
  const email = isStudentEmail(user.email) || text(user.email).toLowerCase();
  if (!phone) {
    return { error: "Enter a Uganda mobile number, for example 772 123 456." };
  }
  if (!personType) return { error: "Say whether this person is a citizen or a student." };
  if (!name) return { error: "Enter the person's name." };
  if (personType === "student" && !isStudentEmail(email)) {
    return { error: "Use your Makerere student email, name@students.mak.ac.ug." };
  }
  // Optional on every save. An empty password keeps the one already stored.
  const password = typeof body?.password === "string" ? body.password : "";
  if (password && password.length < PASSWORD_MIN) {
    return { error: `Use a password of at least ${PASSWORD_MIN} characters.` };
  }
  if (password.length > 128) return { error: "Use a password of 128 characters or fewer." };

  const home = user.home || {};
  const kin = user.kin || {};
  const med = user.med || {};
  const lat = Number(home.lat);
  const lng = Number(home.lng);

  return {
    phoneDigits: phone.national,
    email,
    values: [
      text(user.phone),
      phone.national,
      personType,
      name,
      email,
      text(user.uni),
      text(user.studentNo),
      text(user.hall),
      text(user.lang) || "English",
      text(kin.name),
      text(kin.rel),
      text(kin.phone),
      text(home.text),
      Number.isFinite(lat) ? lat : null,
      Number.isFinite(lng) ? lng : null,
      text(med.blood),
      text(med.allergies),
      text(med.cond),
      text(med.meds),
      med.share !== false,
      Boolean(body?.profileDone),
      text(safety.mode) || "always",
      safety.kin !== false,
      Number.isFinite(Number(safety.pings)) ? Number(safety.pings) : 3,
      [5, 15, 30, 60].includes(Number(safety.wait)) ? Number(safety.wait) : 30,
      password ? hashCode(password) : "",
    ],
  };
}

export function fromRow(row) {
  return {
    profileDone: row.profile_done,
    safety: {
      mode: row.safety_mode,
      kin: row.safety_kin,
      pings: row.safety_pings,
      wait: [5, 15, 30, 60].includes(Number(row.safety_wait_mins)) ? Number(row.safety_wait_mins) : 30,
    },
    user: {
      type: row.person_type,
      name: row.name,
      phone: row.phone,
      email: row.email,
      uni: row.university,
      studentNo: row.student_no,
      hall: row.hall,
      lang: row.language,
      hasPassword: Boolean(row.password_hash),
      kin: { name: row.kin_name, rel: row.kin_relation, phone: row.kin_phone },
      home: {
        text: row.home_text,
        lat: row.home_lat,
        lng: row.home_lng,
      },
      med: {
        blood: row.blood,
        allergies: row.allergies,
        cond: row.conditions,
        meds: row.medications,
        share: row.share_medical,
      },
    },
  };
}

const columns = `
  phone, phone_digits, person_type, name, email, university, student_no, hall, language,
  kin_name, kin_relation, kin_phone, home_text, home_lat, home_lng,
  blood, allergies, conditions, medications, share_medical,
  profile_done, safety_mode, safety_kin, safety_pings, safety_wait_mins, password_hash
`;

export function peopleRouter(pool) {
  const router = Router();

  router.post("/", async (req, res) => {
    const parsed = toRow(req.body);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const session = await authSession(pool, sessionToken(req));
      const student = parsed.values[2] === "student";
      const matches = student
        ? session?.channel === "email" && session.destination === parsed.email
        : session?.channel === "sms" && session.destination === parsed.phoneDigits;
      if (!matches) {
        res.status(401).json({
          error: student
            ? "Confirm the Makerere student email before saving this profile."
            : "Confirm the phone number by SMS before saving this profile.",
        });
        return;
      }
      if (student) {
        // A student types the phone number; it is not confirmed. It must not take over someone else's row.
        const owner = await pool.query("select email from people where phone_digits = $1", [parsed.phoneDigits]);
        if (owner.rows[0] && owner.rows[0].email.toLowerCase() !== parsed.email) {
          res.status(409).json({ error: "That phone number already belongs to another account." });
          return;
        }
      }
      const saved = await pool.query(
        `insert into people (${columns})
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
         on conflict (phone_digits) do update set
           phone = excluded.phone,
           person_type = excluded.person_type,
           name = excluded.name,
           email = excluded.email,
           university = excluded.university,
           student_no = excluded.student_no,
           hall = excluded.hall,
           language = excluded.language,
           kin_name = excluded.kin_name,
           kin_relation = excluded.kin_relation,
           kin_phone = excluded.kin_phone,
           home_text = excluded.home_text,
           home_lat = excluded.home_lat,
           home_lng = excluded.home_lng,
           blood = excluded.blood,
           allergies = excluded.allergies,
           conditions = excluded.conditions,
           medications = excluded.medications,
           share_medical = excluded.share_medical,
           profile_done = excluded.profile_done,
           safety_mode = excluded.safety_mode,
           safety_kin = excluded.safety_kin,
           safety_pings = excluded.safety_pings,
           safety_wait_mins = excluded.safety_wait_mins,
           password_hash = case when excluded.password_hash <> '' then excluded.password_hash else people.password_hash end,
           updated_at = now()
         returning *`,
        parsed.values,
      );
      res.json(fromRow(saved.rows[0]));
    } catch (err) {
      if (err.code === "23505") {
        res.status(409).json({ error: "That university email is already used by another person." });
        return;
      }
      res.status(503).json({ error: "The database is not available." });
    }
  });

  router.get("/", async (req, res) => {
    const phoneDigits = digits(req.query.phone);
    const email = text(req.query.email).toLowerCase();
    if (phoneDigits.length < 9 && !email) {
      res.status(400).json({ error: "Look up a person by phone or university email." });
      return;
    }
    try {
      // A profile holds the medical card and next of kin, so only its owner may read it.
      const me = await personFromRequest(pool, req);
      if (!me) {
        res.status(401).json({ error: "Sign in again to open this profile." });
        return;
      }
      const found = phoneDigits.length >= 9
        ? await pool.query("select * from people where phone_digits = $1", [phoneDigits])
        : await pool.query("select * from people where lower(email) = $1", [email]);
      if (found.rows[0] && found.rows[0].phone_digits !== me.phoneDigits) {
        res.status(403).json({ error: "This profile belongs to someone else." });
        return;
      }
      if (!found.rows[0]) {
        res.status(404).json({ error: "No person is saved with those details." });
        return;
      }
      res.json(fromRow(found.rows[0]));
    } catch {
      res.status(503).json({ error: "The database is not available." });
    }
  });

  return router;
}
