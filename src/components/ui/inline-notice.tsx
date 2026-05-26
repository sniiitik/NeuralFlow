type NoticeTone = "error" | "info";

const toneStyles: Record<NoticeTone, string> = {
  error: "border-[#6b2f35] bg-[#341b1f] text-[#ffd9dd]",
  info: "border-white/10 bg-white/[0.03] text-[#d7d2c8]",
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
    <div className={`rounded-2xl border px-4 py-3 ${toneStyles[tone]}`}>
      <p className="text-sm font-bold tracking-[-0.02em]">{title}</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}
