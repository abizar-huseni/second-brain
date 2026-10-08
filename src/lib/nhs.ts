// Trusted UK guidance the assistant can quote and link. Every line was checked on nhs.uk / gov.uk.
// The assistant cites these by key, e.g. "NHS says adults need 7 to 9 hours of sleep [nhs:sleep-hours]".
export type Guidance = { key: string; topic: string; fact: string; source: string; url: string };

export const GUIDANCE: Guidance[] = [
  { key: "sleep-hours", topic: "sleep", fact: "Adults need 7 to 9 hours of sleep a night.", source: "NHS: Insomnia", url: "https://www.nhs.uk/conditions/insomnia/" },
  { key: "sleep-regular", topic: "sleep", fact: "Wake up and get out of bed at the same time every day, and do not sleep in after a bad night; keep to your usual hours.", source: "NHS: Insomnia", url: "https://www.nhs.uk/conditions/insomnia/" },
  { key: "sleep-avoid", topic: "sleep", fact: "No smoking, alcohol, tea or coffee for at least 6 hours before bed, no big meal late at night, no exercise in the 4 hours before bed, and no daytime naps.", source: "NHS: Insomnia", url: "https://www.nhs.uk/conditions/insomnia/" },
  { key: "sleep-screens", topic: "sleep", fact: "Avoid phones, tablets and computers for an hour before bed; a quiet, dark, cool room helps.", source: "NHS Every Mind Matters", url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-fall-asleep-faster-and-sleep-better/" },
  { key: "sleep-20min", topic: "sleep", fact: "If you are still awake after about 20 minutes, get up, sit somewhere comfortable and go back to bed when sleepy. Write tomorrow's to-do list before bed if worries keep you up.", source: "NHS Every Mind Matters", url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-fall-asleep-faster-and-sleep-better/" },
  { key: "quit-28", topic: "quit", fact: "Reach 28 days smoke-free and you are 5 times more likely to quit for good.", source: "NHS Better Health", url: "https://www.nhs.uk/better-health/quit-smoking/" },
  { key: "quit-timeline", topic: "quit", fact: "8 hours: carbon monoxide halves. 48 hours: CO at non-smoker level. 72 hours: breathing easier. 2 to 12 weeks: circulation improves. 3 to 9 months: lung function up to 10% better. 1 year: heart attack risk halved.", source: "NHS Better Health", url: "https://www.nhs.uk/better-health/quit-smoking/" },
  { key: "quit-free-help", topic: "quit", fact: "Local NHS stop smoking services are free and improve your chances. England: Smokefree National Helpline 0300 123 1044. The NHS Quit Smoking app is free.", source: "NHS stop smoking services", url: "https://www.nhs.uk/live-well/quit-smoking/nhs-stop-smoking-services-help-you-quit/" },
  { key: "activity", topic: "fitness", fact: "At least 150 minutes of moderate activity (or 75 vigorous) a week, plus strength work for all major muscles on at least 2 days.", source: "NHS activity guidelines", url: "https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/" },
  { key: "alcohol", topic: "health", fact: "No more than 14 units of alcohol a week, spread over several days, with regular alcohol-free days.", source: "NHS alcohol advice", url: "https://www.nhs.uk/live-well/alcohol-advice/the-risks-of-drinking-too-much/" },
  { key: "sugar", topic: "food", fact: "Added sugar: no more than about 30g a day for adults (5% of daily energy).", source: "NHS: cut down on sugar", url: "https://www.nhs.uk/live-well/eat-well/how-to-cut-down-on-sugar-in-your-diet/" },
  { key: "water", topic: "food", fact: "Aim for 6 to 8 cups or glasses of fluid a day, more if active.", source: "NHS: water and drinks", url: "https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/water-drinks-nutrition/" },
  { key: "stress", topic: "mind", fact: "For stress: list 3 things you are thankful for each day, stay active to burn off nervous energy, and break big jobs into small steps.", source: "NHS Every Mind Matters", url: "https://www.nhs.uk/every-mind-matters/mental-health-issues/stress/" },
  { key: "graduate-visa", topic: "visa", fact: "The Graduate visa must be applied for in the UK before the Student visa expires, after the university reports that the course is complete.", source: "GOV.UK Graduate visa", url: "https://www.gov.uk/graduate-visa" },
];

export const guidanceByKey = (key: string) => GUIDANCE.find((g) => g.key === key);

// Compact block for AI prompts.
export const GUIDANCE_PROMPT = `## Trusted guidance (quote these, cite as [nhs:key])
${GUIDANCE.map((g) => `- [nhs:${g.key}] ${g.fact} (${g.source})`).join("\n")}`;

// Turns "[nhs:sleep-hours]" citations in AI text into sources.
export function citedGuidance(text: string): Guidance[] {
  const keys = new Set([...text.matchAll(/\[nhs:([a-z0-9-]+)\]/g)].map((m) => m[1]));
  return GUIDANCE.filter((g) => keys.has(g.key));
}
export const stripCitations = (text: string) => text.replace(/\s*\[nhs:[a-z0-9-]+\]/g, "");
