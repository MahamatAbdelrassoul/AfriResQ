# AfriResQ

Emergency coordination for Uganda. Medical help is the main path. A citizen joins with a Uganda phone number. A Makerere student joins with a university email. Both use the same profile.

The hospital desk and the police desk are on the same website, behind their own sign-in. The team page is a separate address. It is not linked from the welcome screen.

Sign-in uses the 6-digit code from the SMS or the email. A partner signs in with the 8-digit code sent when the team confirms them, then sets Available before new requests are sent. Distances are measured from the person's location when the phone shares it. Without that, the map uses the sample distance stored with each place. The drive time is a straight-line estimate, not a live road route. Live GPS uses this browser's location on localhost. A phone opened through a 192.168 address cannot share GPS until the site is served over HTTPS. The Android app uses the phone's own location permission.

## What is saved

Supabase holds the people, the cases, the places, the desk codes, and the team sign-in. The website keeps a copy of the profile in the browser so the screens can open, and the API is the copy that remains after the browser is closed.

| Folder | What it is |
| --- | --- |
| `frontend` | The website, and the Android app in `frontend/android`. React, Vite, and our own CSS. |
| `backend` | The API. Node.js and Express. The tables are in `backend/src/schema.sql`. |
| `supabase` | Settings for the local Supabase stack. |
| `docs` | Diagrams. |

## Run it

The database is Supabase: PostgreSQL with PostGIS for map searches. On your computer it runs as the local Supabase stack in Docker. The same setup moves to a Supabase cloud project later.

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [Node.js](https://nodejs.org/) 20 or newer. Then, from this folder:

```bash
npm install
copy backend\.env.example backend\.env
npm run db:start
npm run dev:backend
npm run dev:frontend
```

On macOS or Linux, use `cp backend/.env.example backend/.env` instead of `copy`.

Open the API and the website in two terminals. The site is http://localhost:5173. The team page is http://localhost:5173/admin. The API health check is http://localhost:4001/api/health and should say the database is connected.

`npm run db:start` prints the Supabase addresses. Studio, where you can browse the tables, is http://127.0.0.1:54323. Stop the database with `npm run db:stop`. Your data is kept until the next start.

The first start creates the tables and the two Makerere desks. Codes in a fresh copy:

| Who | Code |
| --- | --- |
| Makerere University Hospital | 481926 |
| Makerere Police Station | 730614 |
| Team page | 905511 |

Change those in `backend/.env` before the first start if you want different codes. The file `backend/.env` stays on your computer. It is not part of the git history.

## Android

The phone app is the same website, installed with Capacitor. It calls the API at the address in `frontend/.env.mobile` (copy `frontend/.env.mobile.example`). That address must be reachable from the phone, and the API must be running. A debug build needs the Android SDK and JDK 21.

```bash
cp frontend/.env.mobile.example frontend/.env.mobile
npm run mobile:android
```

The installable file is `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. iOS is added on a Mac with `npx cap add ios` from the `frontend` folder.

## No data bundle

A person with no internet can still raise an alert. Dial the USSD code, or text the AfriResQ SMS line.

| How | What they send |
| --- | --- |
| USSD | The code in `USSD_CODE` (a fresh copy uses `*284#`). Choose ambulance, police, or fire, then type the place. |
| SMS | `AMBULANCE Wandegeya`, or `POLICE` or `FIRE` with the place. `HELP` sends the instructions. |

The phone company or the SMS gateway must point at this API before those lines answer. The callbacks are `POST /api/channels/ussd` and `POST /api/channels/sms`. Add `?key=` with `CHANNEL_WEBHOOK_KEY` from `backend/.env`. USSD follows the Africa's Talking session: the reply starts with `CON` while the menu continues and `END` when the case is saved. A reply text uses the UGSMS account already used for sign-in codes. The desk is also texted when its place has a real Uganda mobile, so a responder without a data bundle still hears about the case. Calling 999 or 112 remains the path when someone is in danger now. The short code is not live until the operator assigns it.
