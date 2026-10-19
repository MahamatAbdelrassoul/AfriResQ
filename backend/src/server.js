import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import pg from "pg";
import { adminRouter, seedAdmin } from "./admin.js";
import { authRouter } from "./auth.js";
import { casesRouter } from "./cases.js";
import { deskRouter, seedDeskCodes } from "./desks.js";
import { peopleRouter } from "./people.js";
import { partnerRouter } from "./partners.js";
import { placesRouter } from "./places.js";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const app = express();
const port = Number(process.env.PORT) || 4001;
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Copy backend/.env.example to backend/.env.");
  process.exit(1);
}
// The local Supabase stack has no SSL. Supabase cloud requires it. Put the
// project's CA certificate in DATABASE_SSL_CA to also check who answers.
const dbHost = new URL(process.env.DATABASE_URL).hostname;
const isLocalDb = ["localhost", "127.0.0.1", "::1"].includes(dbHost);
const caPath = process.env.DATABASE_SSL_CA;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : caPath
    ? { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true }
    : { rejectUnauthorized: false },
});
// A dropped network or a database restart breaks idle connections. The pool drops them and
// opens new ones on the next request, so the API keeps running instead of crashing.
pool.on("error", (err) => {
  console.error("A database connection was lost:", err.message);
});

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRouter(pool));
app.use("/api/people", peopleRouter(pool));
app.use("/api/cases", casesRouter(pool));
app.use("/api/places", placesRouter(pool));
app.use("/api/partners", partnerRouter(pool));
app.use("/api/desk", deskRouter(pool));
app.use("/api/admin", adminRouter(pool));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", service: "afriresq-api", database: "connected" });
  } catch {
    res.status(503).json({
      status: "error",
      service: "afriresq-api",
      database: "disconnected",
    });
  }
});

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

async function start() {
  try {
    await pool.query(schema);
    await seedDeskCodes(pool);
    await seedAdmin(pool);
    console.log("Database tables are ready");
  } catch (err) {
    console.error("Database tables were not created:", err.message);
    process.exit(1);
  }
  app.listen(port, () => {
    console.log(`AfriResQ API listening on ${port}`);
  });
}

start();
