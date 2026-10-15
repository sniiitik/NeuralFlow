import { getPrisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.slice(0, 100);
  const rows = await getPrisma().auditLog.findMany({
    where: query
      ? {
          OR: [
            { action: { contains: query, mode: "insensitive" } },
            { actor: { contains: query, mode: "insensitive" } },
            { entityId: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      actor: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
    },
  });
  return (
    <div className="space-y-7">
      <PageHeader
        title="Audit History"
        description="Persisted operational and access events. Latest 100 matching records."
      />
      <form className="flex gap-2">
        <input
          aria-label="Search audit events"
          name="q"
          defaultValue={query}
          placeholder="Search actor, action, or resource…"
          className="w-full max-w-lg"
          maxLength={100}
        />
        <button className="btn">Search</button>
      </form>
      <div className="panel overflow-x-auto" tabIndex={0} role="region" aria-label="Audit table; scroll horizontally on narrow screens">
        <table className="min-w-[760px]">
          <thead>
            <tr>
              <th>Action</th>
              <th>Resource</th>
              <th>Actor</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.action}</td>
                <td>
                  <div>{r.entityType}</div>
                  <div className="mono muted max-w-xs">{r.entityId}</div>
                </td>
                <td className="mono max-w-[200px]">{r.actor}</td>
                <td className="whitespace-nowrap text-xs muted">
                  <time
                    dateTime={r.createdAt.toISOString()}
                    title={r.createdAt.toISOString()}
                  >
                    {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}{" "}
                    UTC
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 muted">No matching audit events.</p>}
      </div>
      <p className="text-xs muted">
        A control request records an attempted operation. Completion is recorded
        separately by the lifecycle engine. Sensitive event payloads are
        omitted.
      </p>
    </div>
  );
}
