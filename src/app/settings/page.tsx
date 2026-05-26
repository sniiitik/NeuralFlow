import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Settings } from "lucide-react";

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="A placeholder for environments, alert thresholds, registry storage, and deployment policies."
      />
      <EmptyState
        icon={Settings}
        title="Production settings can live here"
        description="Wire this page to auth, environments, API keys, alert thresholds, and audit logging."
      />
    </div>
  );
}
