// Shows assistant text with its NHS / GOV.UK citations turned into small source links.
import { citedGuidance, stripCitations } from "@/lib/nhs";

export default function Cited({ text, className = "" }: { text: string; className?: string }) {
  const sources = citedGuidance(text);
  return (
    <span className={className}>
      {stripCitations(text)}
      {sources.map((g) => (
        <a
          key={g.key}
          href={g.url}
          target="_blank"
          rel="noreferrer"
          title={g.fact}
          className="ml-1 inline-flex translate-y-[-1px] items-center rounded-full bg-sky-500/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-sky-600 dark:text-sky-300"
        >
          {g.url.includes("gov.uk") ? "GOV.UK" : "NHS"}
        </a>
      ))}
    </span>
  );
}
