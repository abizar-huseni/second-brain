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

## A brain that thinks for you

The assistant (default name "Brain", rename it on the Me page) runs on the server every 30 minutes and works without you opening the app:

| When | What it does |
|---|---|
| 6am | **Thinks ahead on its own**: reads everything (about me, check-ins, tasks, bills, money, health, email, calendar, quit progress), optionally searches the web, and writes "Brain noticed" insights with numbers and dates. Each comes with a one-tap action: add a goal, task, upcoming expense, habit or note. |
| 7am | Morning brief, pushed to your phone |
| Daytime | Today's plan if missing, a 12-month plan (monthly), the week plan (Sunday evening), the money plan (weekly: safe-to-spend per day, save per week, debt order) |
| 6pm | Evening brief |
| 8pm | **Tomorrow's plan**: 3 non-negotiables, should-dos, shape of the day around your calendar, spending limit |
| 9:30pm | Nudge if the night check-in is missing |

Everything it suggests is a suggestion: it drafts, you tap to accept.

**Web research (optional, free):** add `TAVILY_API_KEY` in Vercel (1,000 searches/month free at tavily.com). The assistant then plans up to 3 searches each morning to check rules, costs and deadlines, and cites them.

**Phone notifications:** Me → Notifications → Turn on. Keys are generated and stored in Supabase automatically.

## Thought dump

For the brilliant thought that's gone a minute later:
- **+ → 💭 Thought**: type or tap the mic and talk (free, built into Chrome). Long-press the app icon for "Dump a thought", or share text/links from any app to Second Brain.
- The assistant files each one straight away as a **rule** ("always go for free options"), **fact** about you, **idea**, **goal**, **worry** or **reminder**, and tells you in one line how it'll use it.
- Rules and facts go into every brief, plan and insight from then on. Recent ideas and worries are context.
- **Remember this?** on Today brings back one old idea a day. Act on it, keep it, or let it go.
- "Remind me on Friday..." gets a phone notification that morning.

## Sleep debt and body clock

On the Body page (and a tile on Today):
- **Sleep debt** over the last 7 nights against your need (NHS: adults need 7 to 9 hours; default 8h, change it on the card). Catching up counts.
- **Body clock**: early bird, in between or night owl, worked out from the middle of your sleep on free days (the Munich ChronoType method), plus how much weekends shift your clock ("social jetlag") and how much your bedtime wanders.
- **Wake-ups in the night**: how many, how long, and the hour you most often wake, from your watch's sleep stages.
- **Tonight**: a bedtime that pays your debt back without sleeping in (NHS advice), and a push an hour before to put screens away.
- No watch? Tap **Going to sleep** and **I'm up**, or log a night by hand. Your Samsung Health export fills in your history too.

## Mindset fuel

Every morning the assistant picks a quote, one book in 60 seconds (3 ideas you can use today), a short video and a podcast episode, chosen for what you're going through right now. Swipe through it on Today.

## Brain Link (your laptop)

A tiny program for your laptop ([`agent/`](agent/)): ask "my screen keeps going black" and it suggests the fix, you tap **Approve**, the laptop does it. A fixed list of safe actions only (screen and sleep timers, lock, reminders, find files, read a document into memory, tidy a folder with undo). There is no "run any command".

## Free AI that doesn't stall

The assistant tries Gemini first, then Gemini's sibling models (each has its own free quota), then any backups you add in Vercel: `NVIDIA_API_KEY` (build.nvidia.com, free), `GROQ_API_KEY` (console.groq.com, free). "High demand" errors from one model just move it to the next.

## Quitting (nicotine, junk food...)

The Quit page and the card on Today:
- Live "clean for" clock, money saved, and the NHS quit timeline.
- **I'm craving** opens an SOS screen: a 3-minute box-breathing timer (cravings last a few minutes), your own "why", money saved, the next milestone, tactics for where you are (bar, friends vaping, stress, after food...), and "Talk me through it" from the assistant.
- Log beaten or slipped. A slip restarts the clock and keeps your record.
- It learns your triggers and peak hours, warns you 30 minutes before your usual craving time, and celebrates milestones as they pass.

## AI coach (free)

The Today page has a coach that reads your last 7 days (check-ins, habits, goals, watch data, money, notes) and gives you a headline, 3 things to do today, one win and one warning. You can also ask it anything about your data.

It uses any OpenAI-compatible API. The default is Google Gemini's free tier:

1. Get a free key at [aistudio.google.com](https://aistudio.google.com) (no card needed).
2. In Vercel, add `AI_API_KEY`, then redeploy.

Optional: `AI_MODEL` (default `gemini-3.8-flash`) and `AI_BASE_URL` to switch provider, e.g. Groq: `AI_BASE_URL=https://api.groq.com/openai/v1`, `AI_MODEL=openai/gpt-oss-120b`. Briefs are cached per morning/evening on each device to stay inside free limits.

## What v2 adds (so far)

- **Notes**: dump thoughts in one tap, group them with #tags, search them
- **Mind map**: every #tag becomes a branch around you, sized by how often you think about it
- **Health**: import your Samsung Health export (Galaxy Watch) and see steps, sleep, exercise, stress and heart rate over 7/30/90 days
- **Live watch sync**: Galaxy Watch data flows Samsung Health → Health Connect → the open-source HC Webhook Android app → this app, so steps, sleep, heart rate and workouts update on their own
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

1. **Supabase**: create a free project at [supabase.com](https://supabase.com). Open SQL Editor and run `supabase/schema.sql`, then `supabase/002_notes_money.sql`, then `supabase/003_health.sql`, then `supabase/004_bank.sql`, then `supabase/005_live_health.sql`, then `supabase/006_live.sql`, then `supabase/007_sleep_agent.sql`.
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

## Live mode (free): works while your devices are off

- **Heartbeat:** `supabase/006_live.sql` schedules Supabase's built-in `pg_cron` to call `/api/cron` every 30 minutes. It syncs banks (every 2 hours, if `LUNCHFLOW_API_KEY` is set) and writes the morning (7am) and evening (6pm) coach brief.
- **Gmail + Calendar:** paste [`integrations/google-apps-script.js`](integrations/google-apps-script.js) into script.google.com and follow the 4 steps at the top. Google runs it every 10 minutes and sends new inbox emails (sender, subject, first 200 characters; promotions skipped) and the next 7 days of events.
- **About me:** the Me page holds your situation (visa rules, deadlines, money, health). The coach treats it as hard limits.
- All three use your sync token from the Me page, and status dots on Today show when each last worked.

## Live watch sync (optional, free)

Samsung Health has no web API, but it writes to Android's Health Connect. The open-source [HC Webhook](https://github.com/mcnaveen/health-connect-webhook) app reads Health Connect and posts it here. The Play Store version is paid; the same app is free as `app-foss-release.apk` on its [GitHub releases](https://github.com/mcnaveen/health-connect-webhook/releases).

1. Run `supabase/005_live_health.sql`. Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel (server-only, never `NEXT_PUBLIC_`).
2. Samsung Health → Settings → Health Connect: allow it to share steps, sleep, heart rate and exercise.
3. In the app: Me → Create my sync token.
4. In HC Webhook: grant Health Connect access, add a webhook with the URL and the `x-sync-token` header shown on the Health page, pick an interval.

Raw readings land in `health_samples`; each push recalculates the affected days in `health_days`.

## Roadmap

- [x] **v1**: goals, habits, check-ins, dashboard
- [x] **v2 part 1**: notes + mind map, money (expenses, payslips, debt tracker)
- [x] **v2 part 2a**: Samsung Health CSV import + Health page
- [ ] **v2 part 2b**: Google Keep import (Takeout), payslip PDF upload
- [x] **v3 part 1**: live UK bank sync (Lunch Flow), live Galaxy Watch sync (Health Connect + HC Webhook)
- [x] **v3 part 2**: AI coach (daily brief + ask anything) on a free model, emoji check-ins, redesigned Today
- [x] **v3 part 3**: live mode: server heartbeat, Gmail + Calendar feed, "About me" for the coach
- [x] **v3 part 4**: self-directed insights, day/week/year/money plans, tasks + upcoming expenses, quit system, thought dump with voice + memory, push notifications, quick add
- [x] **v4 part 1**: sleep debt + body clock, mindset fuel, Brain Link laptop agent, AI fallback chain, security hardening, calm redesign (5 tabs)
- [ ] **v4 part 2**: notes from Obsidian, Sunday review
- [ ] **v4**: weekly review, correlations (sleep vs mood vs productivity) in Python

## Build log

| Date | What shipped |
|---|---|
| 2026-10-08 | v1 scaffold: goals, habits, check-ins, dashboard, PWA |
| 2026-10-08 | Deployed on Vercel + Supabase. v2 part 1: notes, mind map, money |
| 2026-10-08 | Samsung Health import: 545 days of watch data in one click |
| 2026-10-08 | Bank statement import + live UK bank sync via Lunch Flow |
| 2026-10-08 | Live Galaxy Watch sync through Health Connect |
| 2026-10-08 | Free AI coach (Gemini), emoji mood + energy, animated Today page |
| 2026-10-08 | Live mode: heartbeat, Gmail + Calendar feed, Me page |
| 2026-10-08 | The assistant thinks and plans on its own; quit system with craving SOS; quick add |
| 2026-10-08 | Sleep debt + body clock, mindset fuel, Brain Link laptop agent, AI that never stalls, redesign |
