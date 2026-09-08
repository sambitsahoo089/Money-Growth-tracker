# WealthHabit — Habit-Driven Wealth Builder

A full-stack personal finance web application that helps users build consistent
financial habits, track savings goals, and watch their net worth grow over time.
Works on **phones and laptops** (mobile-first responsive UI).

Deployed as a **Vercel SPA + Render API + MongoDB Atlas** stack (see
[Deployment](#deployment)). Data is stored in MongoDB, sessions live in MongoDB
too, and every figure is kept in integer **cents** to avoid floating-point drift.

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
┌─────────────────────┐        HTTPS + JSON        ┌──────────────────────┐        ┌──────────────────┐
│  Vercel (static SPA)│  ───────────────────────▶  │  Render (Express API)│ ─────▶ │ MongoDB Atlas    │
│  public/            │  cookies + CORS allow-list │  server.js + src/    │        │ data + sessions  │
└─────────────────────┘                            └──────────────────────┘        └──────────────────┘
   /config.js (lambda)  → window.APP_API_BASE = ""   (same origin)
   /api/* rewrites      → proxied to your-api.onrender.com
```

- **Vercel** serves the static SPA from `public/` **and proxies every `/api/*`
  request to the Render API** (see the rewrite in `public/vercel.json`), so the
  browser only ever talks to one website — the Vercel origin. A tiny lambda
  (`public/api/config.js`) serves `/config.js` returning
  `window.APP_API_BASE = ""`, keeping the SPA same-origin. Vercel's project
  **Root Directory must be `public`** so the SPA lands at `/` and the rewrites
  apply.
- **Render** runs the whole Express server (`node server.js`): all `/api/*`
  routes, session management (MongoDB-backed store), CORS + CSRF handling for
  the Vercel origin, and it also serves the SPA itself, so opening the Render
  URL directly still works.
- **MongoDB Atlas** stores all collections plus the `sessions` collection
  (auto-expiring via a TTL index).

Because the SPA and API share the Vercel origin, session cookies are
**first-party** — they work in every browser and on every phone, including
Safari/Chrome's third-party cookie blocking. (Cookies are still
`SameSite=None; Secure` in production, which is harmless same-site.) Login
rate limiting is in-memory — fine for Render's single instance.

### Runtime config / env vars

| Variable | Where | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Render (required) | `mongodb+srv://…` connection string (any host — local `mongod` works too) |
| `MONGODB_DB` | optional | Override the database name (defaults to the name in the URI, else `wealthhabit`) |
| `SESSION_SECRET` | Render (required in prod) | Signs session cookies. Without it a random secret is used per boot |
| `ALLOWED_ORIGINS` | Render | Comma-separated SPA origins, e.g. `https://wealthhabit.vercel.app`. Same-origin requests always pass |
| `API_BASE_URL` | optional | No longer needed — the Vercel SPA is same-origin via the `/api/*` proxy. Left over from the old cross-origin setup; safe to leave set or delete |
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
   easiest for Render/Vercel, still protected by the DB password).
4. **Databases** → Connect → Drivers → copy the connection string and append
   your database name, e.g.:
   `mongodb+srv://wealthhabit:<password>@cluster0.xxxxx.mongodb.net/wealthhabit`.

### 2. Render (API)

1. Push this repo to GitHub.
2. Render dashboard → **New → Web Service**, connect the repo.
3. Settings: **Build Command** `npm install`, **Start Command** `node server.js`,
   instance type Free or higher.
4. **Environment** → add:
   - `MONGODB_URI` (from step 1)
   - `SESSION_SECRET` (long random string)
   - `ALLOWED_ORIGINS` → `https://<your-vercel-app>.vercel.app`
   - `NODE_ENV` → `production`
5. Deploy, then confirm `https://<your-render-app>.onrender.com/config.js`
   prints `window.APP_API_BASE = "";`.

### 3. Vercel (frontend)

1. Vercel dashboard → **Add New → Project**, connect the same repo.
2. **Root Directory: `public`** (this folder contains the SPA plus
   `vercel.json` and the `api/config.js` lambda).
3. Deploy — no environment variables are needed. The `/api/*` proxy in
   `vercel.json` already points at your Render service.
4. Open the site — the SPA loads `/config.js` (same-origin) and every API call
   goes through Vercel to Render with a first-party session cookie.

> Changed your Render URL? Update the `/api/*` destination inside
> `public/vercel.json` (and `ALLOWED_ORIGINS` on Render), commit, and push —
> Vercel redeploys automatically.

### Verify

- Sign in as a demo client (`alex@example.com` / `DemoPass1`) from the Vercel
  URL and browse the Dashboard, Expense Tracker, Habit Tracker, Savings Goals
  and Wealth Analytics. Log an expense and an asset value, then check the
  Admin Panel (`sambitkusahoo089@gmail.com` / `sam@1234`) shows the activity.

## Security & validation

- **Passwords**: hashed with bcrypt (cost 10). Registration enforces email
  format, name length, and 8+ char passwords with letters + numbers.
- **Sessions**: httpOnly cookies (`SameSite=None; Secure` in production),
  stored in MongoDB with a 7-day TTL index. Signing secret via `SESSION_SECRET`.
- **CSRF**: every state-changing request is rejected unless the
  `Origin`/`Referer` host matches the server host *or* the configured
  `ALLOWED_ORIGINS` (the Vercel SPA).
- **CORS**: preflights and credential headers are handled only for whitelisted
  origins (see `cors()` in `src/middleware.js`).
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

Request flow: the SPA (on Vercel) reads `window.APP_API_BASE` from
`/config.js`, then every interaction calls a REST endpoint under `/api/*` on
the Render server, which `server.js` routes into `src/routes/`; routes read and
write MongoDB collections (created and indexed by `src/db.js`). There is no
build step.

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
└── public/                       # ── SPA (Vercel, Root Directory = public) ──
    ├── index.html                # Single page shell that loads all JS below
    ├── vercel.json               # /config.js → lambda; /api/* → Render proxy
    ├── api/config.js             # Vercel lambda: APP_API_BASE = "" (same origin)
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
| `public/api/config.js` | Vercel lambda answering `/config.js` with `window.APP_API_BASE = ""` (same origin — Vercel proxies `/api/*` to Render). |
| `public/vercel.json` | Maps `/config.js` to that lambda and proxies `/api/:path*` to the Render API. The Express server answers `/config.js` itself, so local dev and direct Render access work with no Vercel. |
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
