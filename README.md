# AfriResQ

Emergency coordination for Uganda. Medical help is the main path. A citizen joins with a Uganda phone number. A Makerere student joins with a university email. Both use the same profile.

The hospital desk and the police desk are on the same website, behind their own sign-in. The team page is a separate address. It is not linked from the welcome screen.

Android, iOS, SMS, email delivery, and real driving routes come later. Until then, the sign-in code on the website is any 6 digits, and the distances on the map are sample figures stored with each place. Live GPS uses this browser's location on localhost. A phone opened through a 192.168 address cannot share GPS until the site is served over HTTPS.

## What is saved

PostgreSQL holds the people, the cases, the places, the desk codes, and the team sign-in. The website keeps a copy of the profile in the browser so the screens can open, and the API is the copy that remains after the browser is closed.

| Folder | What it is |
| --- | --- |
| `frontend` | The website. React, Vite, and our own CSS. |
| `backend` | The API. Node.js and Express. The tables are in `backend/src/schema.sql`. |
| `docs` | Diagrams. |

## Run it

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [Node.js](https://nodejs.org/) 20 or newer. Then, from this folder:

```bash
npm install
copy backend\.env.example backend\.env
docker compose up -d
npm run dev:backend
npm run dev:frontend
```

On macOS or Linux, use `cp backend/.env.example backend/.env` instead of `copy`.

Open the API and the website in two terminals. The site is http://localhost:5173. The team page is http://localhost:5173/admin. The API health check is http://localhost:4001/api/health and should say the database is connected.

The first start creates the tables and the two Makerere desks. Codes in a fresh copy:

| Who | Code |
| --- | --- |
| Makerere University Hospital | 481926 |
| Makerere Police Station | 730614 |
| Team page | 905511 |

Change those in `backend/.env` before the first start if you want different codes. The file `backend/.env` stays on your computer. It is not part of the git history.
