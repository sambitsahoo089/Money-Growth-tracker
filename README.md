# WealthHabit — Habit-Driven Wealth Builder

A full-stack personal finance web application that helps users build consistent
financial habits, track savings goals, and watch their net worth grow over time.
Works on **phones and laptops** (mobile-first responsive UI).

Deployed as a **Render API + MongoDB Atlas** stack (see
[Deployment](#deployment)). A single Render web service serves the whole frontend from `public/` **and** runs the Express API — there is no separate frontend host. Data is stored in MongoDB and sessions also live in MongoDB; every figure is kept in integer **cents** to avoid floating-point drift.

## Pages (7 interconnected)

| Page | What it does |
| --- | --- |
| **Sign in / Create account** | Login, registration, one shared entry for both clients and the single admin account |
| **Dashboard** | Net worth, monthly income/spending, savings rate, net-worth trend chart, spending donut, goal snapshot, habits due today, recent transactions |
| **Expense Tracker** | Log/edit/delete expenses, income sources, monthly report by category, prev/next month navigation, **CSV export** |
| **Habit Tracker** | Daily/weekly/monthly habits, streak tracking (with grace period), 35-day completion calendar, in-app reminders, completion rates |
| **Savings Goals** | Goals with target amount/deadline/color, progress bars, % and days-left, add/withdraw contributions, overall funding summary |
| **Wealth Analytics** | Manual asset tracking (checking, savings, investments, retirement, crypto…), net-worth line over 12 months, allocation donut |
| **Admin Panel** | Platform metrics, registration growth chart, spending-by-category chart, user list with suspend/reactivate, feedback inbox |

## Demo credentials

> Admin is a **single fixed account** — it cannot be registered or duplicated.

| Role | Email | Password |
| --- | --- | --- |
| **Admin** | `sambitkusahoo089@gmail.com` | `sam@1234` |
| Demo client | `alex@example.com` | `DemoPass1` |
| Demo client | `sam@example.com` | `DemoPass1` |

Clients register through the "Create account" tab. Demo clients come pre-loaded
with realistic data (salary, 4 months of expenses, habits with streaks, savings
goals, multi-account net worth history, feedback) so every page is meaningful.
New registrations start with three habit templates and clean empty states.
The database is seeded automatically on first boot and only when empty.

## Architecture

```text
┌─────────────────────┐        HTTPS + JSON        ┌──────────────────┐
│  Render (web app)   │  ───────────────────────▶  │ MongoDB Atlas     │
│  server.js + public/│  same-origin cookies        │ data + sessions   │
└─────────────────────┘                           └──────────────────┘
   /config.js → window.APP_API_BASE = ""
```

- **Render** runs the **whole app** from one web service (`node server.js`):
  every `/api/*` route, session management (MongoDB-backed store), and the
  frontend (served statically from `public/`, with `index.html` as a fallback for
  the hash router). The browser and the API are the **same origin**, so session
  cookies are first-party and work in every browser and on every phone — no
  separate frontend host is needed.
- **MongoDB Atlas** stores all data collections plus the `sessions` collection
  (auto-expiring via a TTL index).

Cookies are `SameSite=None; Secure` in production and the session store keeps
them alive across restarts. Login rate limiting is in-memory — fine for
Render's single-instance free tier.

### Runtime config / env vars

| Variable | Where | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Render (required) | `mongodb+srv://…` connection string (any host — local `mongod` works too) |
| `MONGODB_DB` | optional | Override the database name (defaults to the name in the URI, else `wealthhabit`) |
| `SESSION_SECRET` | Render (required in prod) | Signs session cookies. Without it a random secret is used per boot |
| `ALLOWED_ORIGINS` | optional | Not needed in a Render-only setup — the frontend and API are the same origin. Same-origin requests always pass regardless. Keep or delete it; it has no effect on a single-service deploy. |
| `PORT` | Render | Render injects this automatically; local default is 3000 |
| `NODE_ENV` | Render | `production` (enables Secure + SameSite=None cookies) |

## Run it locally

Requires **Node.js ≥ 20.19** and a MongoDB instance — a free Atlas M0 cluster
or a local `mongod`.

```bash
npm install

# local MongoDB:
export MONGODB_URI="mongodb://127.0.0.1:27017/wealthhabit"
npm start            # → http://localhost:3000
```

If you use an Atlas cluster, set `MONGODB_URI` to your
`mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/wealthhabit` string
(the app seeds the admin + demo data on first boot).

Other scripts:

```bash
npm run dev         # auto-restart on file changes (node --watch)
npm run seed        # wipe all collections and re-seed fresh demo data
```

## Deployment

### 1. MongoDB Atlas (database)

1. Create a free **M0 cluster** at https://www.mongodb.com/atlas.
2. **Database Access** → Add New Database User (e.g. `wealthhabit`) and set a
   strong password.
3. **Network Access** → Add your IP (or `0.0.0.0/0` for the whole internet —
   easiest for Render, still protected by the DB password).
4. **Databases** → Connect → Drivers → copy the connection string and append
   your database name, e.g.:
   `mongodb+srv://wealthhabit:<password>@cluster0.xxxxx.mongodb.net/wealthhabit`.

### 2. Render (the app — frontend + API)

1. Push this repo to GitHub.
2. Render dashboard → **New → Web Service**, connect the repo.
3. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free (sleeps after ~15 min of no traffic — first load after idle can take up to a minute; Starter keeps it always on)
   - Root Directory: leave blank (repo root / the default)
4. **Environment** → add:
   - `MONGODB_URI` — your Atlas connection string (from step 1)
   - `SESSION_SECRET` — a long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `NODE_ENV` → `production`
   - (optional) `ALLOWED_ORIGINS` and `API_BASE_URL` — ignored in a Render-only setup; safe to leave empty
5. Click **Create Web Service**. Render builds and deploys.
6. Confirm the deploy succeeded, then open `https://<your-render-app>.onrender.com/config.js` in a browser — it should print `window.APP_API_BASE = "";`. That means the SPA is on the same origin as the API.

### Verify

Open `https://<your-render-app>.onrender.com` on your phone and desktop:
- Sign in as a demo client (`alex@example.com` / `DemoPass1`) and browse the
  Dashboard, Expense Tracker, Habit Tracker, Savings Goals and Wealth Analytics.
- Log an expense and an asset value, then check the Admin Panel
  (`sambitkusahoo089@gmail.com` / `sam@1234`) shows the activity.
- **On your phone**: the app stays signed in and shows data — the session cookie is
  first-party because the frontend and API are the same Render origin.

## Security & validation

- **Passwords**: hashed with bcrypt (cost 10). Registration enforces email
  format, name length, and 8+ char passwords with letters + numbers.
- **Sessions**: httpOnly cookies (`SameSite=None; Secure` in production),
  stored in MongoDB with a 7-day TTL index. Signing secret via `SESSION_SECRET`.
- **CSRF**: every state-changing request is rejected unless the
  `Origin`/`Referer` host matches the server host. In a Render-only setup the
  frontend and API are the same origin, so requests always pass.
- **CORS**: preflights and credential headers are handled for approved origins
  (see `cors()` in `src/middleware.js`); same-origin requests always pass.
- **Rate limiting**: sign-in attempts are limited per email + IP (8 tries /
  15 minutes) with lockout messaging.
- **Role guards**: `/api/admin/*` requires the admin role; every other route is
  scoped to the signed-in user (row-level ownership checks on all ids).
- **Suspension**: an admin can suspend a client, who is then blocked at login.
- **Validation**: all inputs validated on the server *and* mirrored on the
  client; errors are returned as clear messages, not crashes.
- **XSS**: all user content is HTML-escaped when rendered.

## Data integrity

Every figure in the demo data is realistic (rent, groceries, salary, brokerage
and 401(k) balances, etc.) — no Lorem Ipsum or `$1` filler. Money is stored as
integer **cents** to avoid floating-point drift, client-side SVGs are
hand-drawn (no chart-library dependency), and multi-document writes are not
used — every mutation is a single targeted update.

## Code structure

Request flow: the SPA (served from `public/` by Render) reads
`window.APP_API_BASE` from `/config.js`, which is always `""` (same origin).
Every interaction calls a REST endpoint under `/api/*` on the same Render server,
which `server.js` routes into `src/routes/`; routes read and
write MongoDB collections (created and indexed by `src/db.js`). There is no
build step and no separate frontend host — Render serves everything.

```text
wealthhabit/
├── server.js                     # Express entry point (see below)
├── package.json                  # Dependencies + npm scripts (start / dev / seed)
├── README.md                     # This file
│
├── src/                          # ── API SERVER (Render) ─────────────
│   ├── db.js                     # Mongo connect, indexes, seed data, money helpers
│   ├── session-store.js          # express-session store backed by MongoDB
│   ├── helpers.js                # Shared constants + validation functions
│   ├── middleware.js             # Auth guards, CORS, CSRF allow-list, login rate limit
│   ├── analytics.js              # Net worth series & monthly aggregates
│   └── routes/                   # ── API route handlers (one per module) ──
│       ├── auth.js               # POST register/login/logout, GET me
│       ├── user.js               # Profile, password change, feedback submit
│       ├── dashboard.js          # Aggregations for the home dashboard
│       ├── expenses.js           # Expense + income-source CRUD, monthly view
│       ├── habits.js             # Habit CRUD, completion toggles, streaks
│       ├── goals.js              # Savings-goal CRUD + contributions
│       ├── wealth.js             # Asset CRUD + net-worth/allocation data
│       └── admin.js              # Platform metrics, users, feedback inbox
│
└── public/                       # ── SPA (served statically by Render) ──
    ├── index.html                # Single page shell that loads all JS below
    ├── vercel.json               # no-op here — kept only if a Vercel copy is ever re-added
    ├── api/config.js             # serves /config.js for the app (also served by Render itself)
    ├── css/styles.css            # Entire dark, responsive design system
    └── js/
        ├── api.js                # Fetch wrapper (configurable API base, 401 redirect)
        ├── ui.js                 # Toasts, modals, money/date formats, icons
        ├── charts.js             # Hand-drawn SVG charts (line/bar/donut)
        ├── router.js             # Hash router, app shell, sidebar, boot logic
        └── pages/                # ── One file per screen ─────────────────
            ├── auth.js           # Login page (Client vs Admin role selector)
            ├── dashboard.js      # Home dashboard
            ├── expenses.js       # Expense Tracker (+ income tab, CSV export)
            ├── habits.js         # Habit Tracker
            ├── goals.js          # Savings Goals
            ├── wealth.js         # Wealth Analytics
            └── admin.js          # Admin Panel
```

### What each file does

| File | Responsibility |
| --- | --- |
| `server.js` | Boots Mongo + indexes, seeds on first run, mounts the MongoDB session store, CORS + CSRF guards, serves `/api/*` route modules, serves `/config.js` and the SPA from `public/`, central error handler. Listens on `PORT` (default 3000). |
| `src/db.js` | Connects to `MONGODB_URI`, creates all collections + indexes (unique email, unique habit completion per date, TTL sessions index), and the transactional seed with realistic demo data + the single admin account. |
| `src/session-store.js` | Minimal persistent `express-session` store over the `sessions` collection (no extra dependency; TTL index expires rows). |
| `src/helpers.js` | Category/type/currency constants plus shared validation (`cleanStr`, `parseAmountCents`, `isValidDate`, email checks). |
| `src/middleware.js` | `requireAuth` / `requireAdmin` guards, `cors()` + `sameOrigin()` CSRF (with `ALLOWED_ORIGINS` allow-list), per-email login rate limiter, `wrap()` for async handlers. |
| `src/analytics.js` | Pure aggregations used by dashboard & wealth routes: latest per-account net worth, month-by-month net-worth series, monthly income/expense totals, spending breakdown, month list. |
| `public/api/config.js` | Serves `/config.js` (returning `window.APP_API_BASE = ""`) — also served directly by the Express app, so there's no separate frontend host needed. |
| `public/vercel.json` | Not used in a Render-only deploy — kept in the repo only so a separate frontend host can be re-added later. Render ignores it. |
| `public/js/api.js` | One `api()` fetch helper: reads `window.APP_API_BASE` from `/config.js`, sends credentials cross-site, throws server errors, redirects to login on 401. |

**Naming convention:** every screen under `public/js/pages/` has a matching API
module under `src/routes/` (e.g. `expenses.js` ↔ `src/routes/expenses.js`), so a
feature touches exactly two files plus `src/db.js` when it needs storage.

Frontend is a single-page app with a hash router (`#/`, `#/expenses`, …) and no
build step. Layout: fixed sidebar on laptops, hamburger drawer on phones; tables
collapse into stacked cards on small screens; modals become bottom sheets.

## Feedback & admin flow

Any signed-in user can send feedback from the sidebar ("Feedback"). It lands in
the Admin Panel → Feedback tab, where it can be marked resolved or re-opened.
