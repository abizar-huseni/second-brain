# Second Brain

A personal dashboard that keeps me in line: goals, habits, daily check-ins, and eventually fitness, money and notes, all in one app on my phone and laptop.

Built in public by [@abizar-huseni](https://github.com/abizar-huseni) while learning Python, SQL and data analysis.

## What v1 does

- **Goals** grouped by area (growth, fitness, mind, money, work), each with small steps and a progress bar
- **Habits** to build and habits to break, ticked daily, with streaks
- **Morning check-in**: mood, energy, top 3 for today
- **Night check-in**: what got done, hours worked, mood, journal
- **Today dashboard**: check-in status, habit score, hours this week, 14-day mood chart, goal progress
- **Installable** on phone and laptop as a PWA

## What v2 adds (so far)

- **Notes**: dump thoughts in one tap, group them with #tags, search them
- **Mind map**: every #tag becomes a branch around you, sized by how often you think about it
- **Health**: import your Samsung Health export (Galaxy Watch) and see steps, sleep, exercise, stress and heart rate over 7/30/90 days
- **Live watch sync**: Galaxy Watch data flows Samsung Health → Health Connect → the free HC Webhook Android app → this app, so steps, sleep, heart rate and workouts update on their own
- **Bank statements**: drop in a Lloyds or HSBC CSV and every transaction is imported and auto-categorised (no duplicates on re-import)
- **Live bank sync**: Lloyds and HSBC (and most UK banks) through [Lunch Flow](https://www.lunchflow.app)'s personal API; balances and transactions sync with one tap
- **Money**: monthly in/out with category breakdown, UK payslips (tax, NI, pension, student loan, £/hour), and a debt tracker with payoff progress and monthly interest cost

## Stack

| Part | Tool | Why |
|---|---|---|
| App | Next.js + React + Tailwind | One codebase for phone and laptop |
| Database + login | Supabase (Postgres) | Real SQL on my own data, Row Level Security keeps it private |
| Hosting | Vercel | Free, deploys on every push |

Database schema: [`supabase/schema.sql`](supabase/schema.sql).

## Setup

1. **Supabase**: create a free project at [supabase.com](https://supabase.com). Open SQL Editor and run `supabase/schema.sql`, then `supabase/002_notes_money.sql`, then `supabase/003_health.sql`, then `supabase/004_bank.sql`, then `supabase/005_live_health.sql`.
2. **Keys**: copy `.env.example` to `.env.local` and paste your Project URL and anon key from Project Settings > API. Never commit `.env.local`.
3. **Run locally**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 and create your account.
4. **Lock it down**: once your account exists, turn off new sign-ups in Supabase (Authentication > Sign In / Providers > "Allow new users to sign up").
5. **Deploy**: import this repo on [vercel.com](https://vercel.com), add the same two env variables, deploy.
6. **Install on your phone**: open the Vercel URL in Chrome > menu > "Add to Home screen". On a laptop, click the install icon in the address bar.

## Live bank sync (optional, ~£3/month)

UK banks don't offer free open banking access to individuals, so this uses [Lunch Flow](https://www.lunchflow.app), which connects UK banks via GoCardless and gives you a personal API.

1. Sign up at Lunch Flow, then **Connections → New Connection** for each bank.
2. **Destinations → Add Destination → REST API**, copy the API key.
3. In Vercel, add `LUNCHFLOW_API_KEY`, then redeploy.
4. In the app: Money → Banks → Sync now.

## Live watch sync (optional, free)

Samsung Health has no web API, but it writes to Android's Health Connect. The [HC Webhook](https://play.google.com/store/apps/details?id=com.hcwebhook.app) app reads Health Connect and posts it here.

1. Run `supabase/005_live_health.sql`. Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel (server-only, never `NEXT_PUBLIC_`).
2. Samsung Health → Settings → Health Connect: allow it to share steps, sleep, heart rate and exercise.
3. In the app: Health → Create my sync token.
4. In HC Webhook: grant Health Connect access, add a webhook with the URL and the `x-sync-token` header shown on the Health page, pick an interval.

Raw readings land in `health_samples`; each push recalculates the affected days in `health_days`.

## Roadmap

- [x] **v1**: goals, habits, check-ins, dashboard
- [x] **v2 part 1**: notes + mind map, money (expenses, payslips, debt tracker)
- [x] **v2 part 2a**: Samsung Health CSV import + Health page
- [ ] **v2 part 2b**: Google Keep import (Takeout), payslip PDF upload
- [x] **v3 part 1**: live UK bank sync (Lunch Flow), live Galaxy Watch sync (Health Connect + HC Webhook)
- [ ] **v3 part 2**: AI coach (daily brief + "what next"), Gmail summary
- [ ] **v4**: weekly review, correlations (sleep vs mood vs productivity) in Python

## Build log

| Date | What shipped |
|---|---|
| 2026-10-08 | v1 scaffold: goals, habits, check-ins, dashboard, PWA |
| 2026-10-08 | Deployed on Vercel + Supabase. v2 part 1: notes, mind map, money |
| 2026-10-08 | Samsung Health import: 545 days of watch data in one click |
| 2026-10-08 | Bank statement import + live UK bank sync via Lunch Flow |
| 2026-10-08 | Live Galaxy Watch sync through Health Connect |
