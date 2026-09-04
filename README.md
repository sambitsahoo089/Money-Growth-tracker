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

## Architecture

```
server.js            Express app, sessions, static SPA serving
src/db.js            node:sqlite schema + idempotent seed (transactional)
src/helpers.js       constants + validation helpers
src/middleware.js    auth guards, CSRF origin check, login rate limiter
src/analytics.js     net worth series, monthly income/expense aggregates
src/routes/          auth, user, dashboard, expenses, habits, goals, wealth, admin
public/              responsive SPA (vanilla JS, hash router, SVG charts)
```

Frontend is a single-page app with a hash router (`#/`, `#/expenses`, …) and no
build step. Layout: fixed sidebar on laptops, hamburger drawer on phones; tables
collapse into stacked cards on small screens; modals become bottom sheets.

## Feedback & admin flow

Any signed-in user can send feedback from the sidebar ("Feedback"). It lands in
the Admin Panel → Feedback tab, where it can be marked resolved or re-opened.
