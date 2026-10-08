# Privacy

Second Brain is a personal, non-commercial app used only by its owner.

- **What's stored:** goals, habits, check-ins, notes, health summaries, and bank transactions and balances that the owner chooses to import or connect.
- **Where:** in the owner's own Supabase database, protected by Row Level Security so each account can only read its own rows.
- **Bank data:** fetched read-only through Lunch Flow (open banking) with the owner's consent, which UK banks require to be renewed every 90 days. The app never sees bank login details.
- **Email and calendar:** if the owner installs the Google Apps Script, it sends the sender, subject and first 200 characters of recent inbox emails, plus the next 7 days of calendar events. Emails are deleted after 30 days.
- **AI coach:** when the owner opens the coach, a summary of the last 7 days (about me, check-ins, habits, tasks, upcoming expenses, goals, health, quit progress, money totals, email subjects, calendar, recent notes) is sent to the configured AI provider (Google Gemini by default) to write the advice. For UK users Google's paid-tier data terms apply, so prompts aren't used to train models. If Gemini is busy and a backup key is set (NVIDIA, Groq, OpenRouter, Hugging Face), the same summary goes to that backup under its own terms. Some free OpenRouter models may log prompts, so it is tried last. Sleep times and stages from the watch are stored in Supabase and summarised for the coach the same way.
- **Web research:** if a Tavily key is set, the assistant sends short search queries (no names or account details) to Tavily to check public rules and costs.
- **Notifications:** a browser push address is stored so the app can send reminders. Turning notifications off in the browser stops them.
- **Sharing:** no data is sold, shared or used for advertising.
- **Deletion:** the owner can delete any record in the app, or the whole database in Supabase.

Contact: via the GitHub profile of the repository owner.
