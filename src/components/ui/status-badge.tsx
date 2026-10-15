import type { DeploymentStatus, ModelStatus } from "@/lib/types";
export function StatusBadge({
  status,
  className = "",
}: {
  status: DeploymentStatus | ModelStatus;
  className?: string;
}) {
  const color = ["live", "completed"].includes(status)
    ? "var(--success)"
    : ["failed", "rolled_back"].includes(status)
      ? "var(--danger)"
      : "var(--secondary)";
  return (
    <span className={`badge ${className}`} style={{ color }}>
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-current"
      />
      {status.replaceAll("_", " ")}
    </span>
  );
}
