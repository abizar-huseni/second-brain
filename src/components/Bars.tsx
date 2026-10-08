// Simple bar chart: one bar per day, optional dashed target line.
export default function Bars({
  data,
  target,
  format = (v) => String(v),
  color = "bg-emerald-500",
}: {
  data: { label: string; value: number | null }[];
  target?: number;
  format?: (v: number) => string;
  color?: string;
}) {
  const max = Math.max(target ?? 0, ...data.map((d) => d.value ?? 0), 1);
  return (
    <div className="relative flex h-28 items-end gap-[2px]">
      {target !== undefined && (
        <div className="absolute inset-x-0 border-t border-dashed border-zinc-400" style={{ bottom: `${(target / max) * 100}%` }} />
      )}
      {data.map((d) => (
        <div
          key={d.label}
          title={`${d.label}: ${d.value === null ? "no data" : format(d.value)}`}
          className={`flex-1 rounded-t ${d.value === null ? "bg-zinc-200 dark:bg-zinc-800" : color}`}
          style={{ height: `${d.value === null ? 3 : Math.max(3, (d.value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
