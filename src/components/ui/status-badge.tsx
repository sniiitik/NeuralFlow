import { clsx } from "clsx";
import type { DeploymentStatus, ModelStatus } from "@/lib/types";

type Status = ModelStatus | DeploymentStatus;

const statusClasses: Record<Status, string> = {
  live: "bg-[#2f641d] text-[#92d85d]",
  canary: "bg-[#f0e2c4] text-[#5b3d13]",
  rolling: "bg-[#e7e3ff] text-[#4b3b91]",
  shadow: "bg-[#1c1c19] text-[#c8c3b8]",
  pending: "bg-[#2f302b] text-[#d7d0bd]",
  running: "bg-[#e7e3ff] text-[#4b3b91]",
  completed: "bg-[#2f641d] text-[#92d85d]",
  rolled_back: "bg-[#442626] text-[#ff9b9b]",
};

const labels: Record<Status, string> = {
  live: "Live",
  canary: "Canary",
  rolling: "Rolling",
  shadow: "Shadow",
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  rolled_back: "Rolled back",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-4 py-1.5 text-base font-bold tracking-[-0.03em]", statusClasses[status], className)}>
      {labels[status]}
    </span>
  );
}
