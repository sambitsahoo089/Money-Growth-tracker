# Freebuff — Habit-Driven Wealth Builder

A full-stack personal finance web application that helps users build consistent
financial habits, track savings goals, and watch their net worth grow over time.
Works on **phones and laptops** (mobile-first responsive UI).

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

## Run it

Requires **Node.js ≥ 22.13** (uses the built-in `node:sqlite`, no native builds).

```bash
npm install
npm start          # → http://localhost:3000
```

Other scripts:

```bash
npm run dev        # auto-restart on file changes (node --watch)
npm run seed       # wipe the database and re-seed fresh demo data
```

Set `PORT=4000 npm start` to change the port. Data is stored in `data/freebuff.db`
(gitignored, created on first run).

## Security & validation

- **Passwords**: hashed with bcrypt (cost 10). Registration enforces email
  format, name length, and 8+ char passwords with letters + numbers.
- **Sessions**: httpOnly, SameSite=Lax cookies (7-day), secret persisted in
  `data/session-secret`. Sessions survive restarts.
- **CSRF**: every state-changing request is rejected unless the `Origin`/
  `Referer` host matches the server host.
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
integer **cents** to avoid floating-point drift, and client-side SVGs are
hand-drawn (no chart-library dependency).

## Code structure

Request flow: the browser loads the SPA from `public/`; every interaction calls a
REST endpoint under `/api/*`, which `server.js` routes into `src/routes/`; routes
read/write the SQLite database created by `src/db.js`. There is no build step.

```text
freebuff-desktop/
├── server.js                     # Express entry point (see below)
├── package.json                  # Dependencies + npm scripts (start / dev / seed)
├── package-lock.json             # Locked dependency versions
├── README.md                     # This file
├── .gitignore                    # Excludes node_modules/, data/, .freebuff/, logs
│
├── src/                          # ── BACKEND ────────────────────────────
│   ├── db.js                     # SQLite schema, money helpers, seed data
│   ├── helpers.js                # Shared constants + validation functions
│   ├── middleware.js             # Auth guards, CSRF check, login rate limit
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
├── public/                       # ── FRONTEND (SPA, no build step) ────────
│   ├── index.html                # Single page shell that loads all JS below
│   ├── css/
│   │   └── styles.css            # Entire dark, responsive design system
│   └── js/
│       ├── api.js                # Fetch wrapper (JSON, errors, 401 redirect)
│       ├── ui.js                 # Toasts, modals, money/date formats, icons
│       ├── charts.js             # Hand-drawn SVG charts (line/bar/donut)
│       ├── router.js             # Hash router, app shell, sidebar, boot logic
│       └── pages/                # ── One file per screen ─────────────────
│           ├── auth.js           # Login page (Client vs Admin role selector)
│           ├── dashboard.js      # Home dashboard
│           ├── expenses.js       # Expense Tracker (+ income tab, CSV export)
│           ├── habits.js         # Habit Tracker
│           ├── goals.js          # Savings Goals
│           ├── wealth.js         # Wealth Analytics
│           └── admin.js          # Admin Panel
│
└── data/                         # ── Generated at runtime (gitignored) ──
    ├── freebuff.db               # SQLite database, auto-created & seeded
    └── session-secret            # Cookie-signing secret, generated on first run
```

### What each file does

| File | Responsibility |
| --- | --- |
| `server.js` | Boots Express, seeds the DB on first run, configures sessions & CSRF, serves `/api/*` route modules, serves the SPA from `public/`, central error handler. Listens on `PORT` (default 3000). |
| `src/db.js` | Defines all SQLite tables (users, income_sources, expenses, habits, habit_completions, goals, assets, feedback), integer-cents helpers, and the transactional seed with realistic demo data + the single admin account. |
| `src/helpers.js` | Category/type/currency constants plus shared validation (`cleanStr`, `parseAmountCents`, `isValidDate`, email checks). |
| `src/middleware.js` | `requireAuth` / `requireAdmin` guards, same-origin CSRF check for POST/PUT/DELETE, per-email login rate limiter. |
| `src/analytics.js` | Pure aggregation used by dashboard & wealth routes: latest per-account net worth, month-by-month net-worth series, monthly income/expense totals, spending breakdown, month list. |
| `src/routes/auth.js` | Registration (rejects the reserved admin email), login (rate-limited, suspension-aware), logout, session lookup. |
| `src/routes/user.js` | Profile get/update, password change, feedback submission — all ownership-scoped. |
| `src/routes/dashboard.js` | Combines net worth, current-month income/spending/savings-rate, top goals, habits due today, recent expenses. |
| `src/routes/expenses.js` | CRUD for expenses & income sources with month filtering; every row is checked against the signed-in user. |
| `src/routes/habits.js` | Habit CRUD, per-date completion toggle, streak & completion-rate math per frequency (day/week/month). |
| `src/routes/goals.js` | Goal CRUD with target/current/deadline/color, and add/withdraw contributions that can't exceed the target or go negative. |
| `src/routes/wealth.js` | Asset CRUD; returns latest valuation per account plus allocation and the 12-month net-worth series. |
| `src/routes/admin.js` | Admin-only: platform metrics, registration-growth & spending data, user list with suspend/reactivate, feedback resolution. |
| `public/index.html` | Marks-up the three mount points (`#app`, `#modal-root`, `#toasts`) and includes every script in load order. |
| `public/css/styles.css` | Dark high-contrast theme via CSS variables; mobile-first layout, drawer nav, responsive stacked tables, bottom-sheet modals. |
| `public/js/api.js` | One `api()` fetch helper: JSON in/out, throws server errors, redirects to login on 401. |
| `public/js/ui.js` | Global `App` state, HTML escaping, toasts, modal/confirm helpers, currency/date formatting, category/asset-type color maps. |
| `public/js/charts.js` | Dependency-free SVG line, bar, donut and sparkline charts; re-renders on resize and reads theme colors from CSS variables. |
| `public/js/router.js` | Hash routing (`#/`, `#/expenses`, …), auth gate + admin gate, renders the sidebar/topbar shell, hosts profile & feedback modals. |
| `public/js/pages/*.js` | One page per screen: fetch its data, render into `#view`, bind actions (each page mirrors its matching route file 1-to-1). |

**Naming convention:** every screen under `public/js/pages/` has a matching API
module under `src/routes/` (e.g. `expenses.js` ↔ `src/routes/expenses.js`), so a
feature touches exactly two files plus `src/db.js` when it needs storage.

Frontend is a single-page app with a hash router (`#/`, `#/expenses`, …) and no
build step. Layout: fixed sidebar on laptops, hamburger drawer on phones; tables
collapse into stacked cards on small screens; modals become bottom sheets.

## Feedback & admin flow

Any signed-in user can send feedback from the sidebar ("Feedback"). It lands in
the Admin Panel → Feedback tab, where it can be marked resolved or re-opened.
