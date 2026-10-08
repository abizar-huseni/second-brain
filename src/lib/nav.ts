// The whole app lives in four places plus "You". Each place can hold a few pages, shown as
// pills under the top bar, so new features slot in without adding another bottom tab.
// To add a page: put it in the right group's `pages` (first page = where the tab opens).

export type NavPage = { href: string; label: string };
export type NavGroup = { key: string; label: string; icon: string; pages: NavPage[] };

export const GROUPS: NavGroup[] = [
  {
    key: "today",
    label: "Today",
    icon: "☀️",
    pages: [
      { href: "/", label: "Today" },
      { href: "/checkin", label: "Check in" },
    ],
  },
  {
    key: "plan",
    label: "Plan",
    icon: "🎯",
    pages: [
      { href: "/plan", label: "Plan" },
      { href: "/goals", label: "Goals" },
      { href: "/habits", label: "Habits" },
    ],
  },
  {
    key: "mind",
    label: "Mind",
    icon: "🧠",
    pages: [{ href: "/notes", label: "Thoughts" }],
  },
  {
    key: "life",
    label: "Life",
    icon: "🌿",
    pages: [
      { href: "/health", label: "Body" },
      { href: "/money", label: "Money" },
      { href: "/quit", label: "Quit" },
    ],
  },
];

export const ME: NavGroup = { key: "me", label: "You", icon: "👤", pages: [{ href: "/me", label: "You" }] };

const ALL = [...GROUPS, ME];

const matches = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

export function groupFor(path: string): NavGroup | null {
  return ALL.find((g) => g.pages.some((p) => matches(path, p.href))) ?? null;
}

export function pageFor(path: string): NavPage | null {
  for (const g of ALL) {
    const p = g.pages.find((x) => matches(path, x.href));
    if (p) return p;
  }
  return null;
}
