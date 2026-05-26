export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-2 text-sm font-bold uppercase tracking-[0.28em] text-[#8d85ff]">{eyebrow}</p> : null}
        <h1 className="text-4xl font-bold tracking-[-0.05em] text-[#f5f3ed] sm:text-5xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-lg text-[#bcb8ad]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
