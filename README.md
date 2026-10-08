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
- **Money**: monthly in/out with category breakdown, UK payslips (tax, NI, pension, student loan, £/hour), and a debt tracker with payoff progress and monthly interest cost

## Stack

| Part | Tool | Why |
|---|---|---|
| App | Next.js + React + Tailwind | One codebase for phone and laptop |
| Database + login | Supabase (Postgres) | Real SQL on my own data, Row Level Security keeps it private |
| Hosting | Vercel | Free, deploys on every push |

Database schema: [`supabase/schema.sql`](supabase/schema.sql).

## Setup

1. **Supabase**: create a free project at [supabase.com](https://supabase.com). Open SQL Editor and run `supabase/schema.sql`, then `supabase/002_notes_money.sql`.
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

## Roadmap

- [x] **v1**: goals, habits, check-ins, dashboard
- [x] **v2 part 1**: notes + mind map, money (expenses, payslips, debt tracker)
- [ ] **v2 part 2**: Samsung Health CSV import, Google Keep import (Takeout), payslip PDF upload
- [ ] **v3**: live Galaxy Watch data via Health Connect, UK Open Banking for Lloyds + HSBC, Gmail summary, AI coach
- [ ] **v4**: weekly review, correlations (sleep vs mood vs productivity) in Python

## Build log

| Date | What shipped |
|---|---|
| 2026-10-08 | v1 scaffold: goals, habits, check-ins, dashboard, PWA |
| 2026-10-08 | Deployed on Vercel + Supabase. v2 part 1: notes, mind map, money |
