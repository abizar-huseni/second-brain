# Privacy

Second Brain is a personal, non-commercial app used only by its owner.

- **What's stored:** goals, habits, check-ins, notes, health summaries, and bank transactions and balances that the owner chooses to import or connect.
- **Where:** in the owner's own Supabase database, protected by Row Level Security so each account can only read its own rows.
- **Bank data:** fetched read-only through Lunch Flow (open banking) with the owner's consent, which UK banks require to be renewed every 90 days. The app never sees bank login details.
- **AI coach:** when the owner opens the coach, a summary of the last 7 days (check-ins, habits, goals, health, money totals, recent notes) is sent to the configured AI provider (Google Gemini by default) to write the advice. For UK users Google's paid-tier data terms apply, so prompts aren't used to train models.
- **Sharing:** no data is sold, shared or used for advertising.
- **Deletion:** the owner can delete any record in the app, or the whole database in Supabase.

Contact: via the GitHub profile of the repository owner.
