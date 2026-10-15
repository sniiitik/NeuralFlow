"use client";
import { PageHeader } from "@/components/ui/page-header";
import { useAccess } from "@/hooks/use-access";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
export default function Page() {
  const { user, role, canWrite } = useAccess();
  const router = useRouter();
  return (
    <div className="space-y-7">
      <PageHeader
        title="Settings & account"
        description="Your session, access level, and local workspace capabilities."
      />
      <section className="panel p-6">
        <h2 className="font-medium">Account</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-3">
          <div>
            <dt className="label">Name</dt>
            <dd>{user?.name ?? "Loading…"}</dd>
          </div>
          <div>
            <dt className="label">Email</dt>
            <dd className="break-all">{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="label">Access level</dt>
            <dd className="capitalize">{role}</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm muted">
          {canWrite
            ? "You can register versions, manage deployments, and run predictions."
            : "You can inspect models, monitoring, and audit history, and run predictions. Deployment changes require an operator or administrator."}
        </p>
        <button
          className="btn mt-5"
          onClick={async () => {
            await authClient.signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          Sign out
        </button>
      </section>
      <section className="panel p-6">
        <h2 className="font-medium">Workspace capabilities</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="label">Inference format</dt>
            <dd>Declarative Iris JSON · scikit-learn</dd>
          </div>
          <div>
            <dt className="label">Storage</dt>
            <dd>PostgreSQL registry · local artifact volume</dd>
          </div>
          <div>
            <dt className="label">Serving topology</dt>
            <dd>Independent blue and green runtimes</dd>
          </div>
          <div>
            <dt className="label">Monitoring</dt>
            <dd>5-minute metrics · 30-minute charts</dd>
          </div>
        </dl>
        <p className="mt-5 text-xs muted">
          Runtime and alert configuration is managed by your administrator.
          Credentials are never displayed here.
        </p>
      </section>
    </div>
  );
}
