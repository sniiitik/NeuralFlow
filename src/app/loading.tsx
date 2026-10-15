export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6">
      <div className="h-7 w-48 rounded bg-[var(--elevated)]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="panel h-28" />
        ))}
      </div>
      <p className="text-sm muted">Loading workspace…</p>
    </div>
  );
}
