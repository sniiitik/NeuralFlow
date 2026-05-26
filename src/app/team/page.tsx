import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { UsersRound } from "lucide-react";

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Team"
        description="A placeholder for role-based access, deployment approvals, and on-call ownership."
      />
      <EmptyState
        icon={UsersRound}
        title="Team workflows are ready to extend"
        description="Add members, assign model owners, and require approval before promoting canary rollouts."
      />
    </div>
  );
}
