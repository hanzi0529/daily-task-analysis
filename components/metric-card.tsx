interface MetricCardProps {
  label: string;
  value: string | number;
  accent?: string;
}

export function MetricCard({ label, value, accent = "text-ink" }: MetricCardProps) {
  return (
    <div className="panel p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}
