// Shared quit maths: time clean, money saved, and the milestones ahead.
export type Quit = { id: string; name: string; started_at: string; cost_per_week: number; why: string; longest_hours: number; active: boolean };
export type Craving = { id: string; quit_id: string; at: string; strength: number | null; trigger: string | null; outcome: string };

export const TRIGGERS = ["bar", "friends vaping", "stress", "after food", "boredom", "morning", "other"];

// NHS Better Health quit timeline + NSW Health on withdrawal.
export const MILESTONES: { hours: number; title: string; body: string }[] = [
  { hours: 1 / 3, title: "20 minutes", body: "Pulse starts returning to normal." },
  { hours: 8, title: "8 hours", body: "Oxygen levels recovering." },
  { hours: 48, title: "48 hours", body: "The hardest stretch of withdrawal is usually days 1-2. Taste and smell start coming back." },
  { hours: 72, title: "3 days", body: "Breathing easier, energy rising. Nicotine is out of your system." },
  { hours: 24 * 7, title: "1 week", body: "Cravings get shorter and further apart from here." },
  { hours: 24 * 14, title: "2 weeks", body: "Most withdrawal symptoms ease or become manageable." },
  { hours: 24 * 28, title: "28 days", body: "NHS: make it to 28 days and you're 5 times more likely to quit for good." },
  { hours: 24 * 90, title: "3 months", body: "Lung function up to 10% better. Coughing and wheezing ease." },
  { hours: 24 * 365, title: "1 year", body: "Heart attack risk half that of a smoker." },
];

export const hoursSince = (iso: string, now = Date.now()) => Math.max(0, (now - Date.parse(iso)) / 3600000);

export function cleanFor(hours: number) {
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  const m = Math.floor((hours * 60) % 60);
  return d ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

export const saved = (q: Quit, hours: number) => (Number(q.cost_per_week) / (7 * 24)) * hours;

export const nextMilestone = (hours: number) => MILESTONES.find((m) => m.hours > hours) ?? null;
