type NoticeTone = "error" | "info";

const toneStyles: Record<NoticeTone, string> = {
  error: "border-[var(--danger)]/30 bg-[var(--surface)] text-[var(--danger)]",
  info: "border-white/10 bg-white/[0.03] text-[var(--secondary)]",
};

export function InlineNotice({
  title,
  message,
  tone = "info",
}: {
  title: string;
  message: string;
  tone?: NoticeTone;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 ${toneStyles[tone]}`}
    >
      <p className="text-sm font-medium tracking-[-0.02em]">{title}</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}
