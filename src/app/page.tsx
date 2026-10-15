import { OverviewPage } from "@/components/pages/overview-page";
import { getPrisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page() {
  const events = await getPrisma().auditLog.findMany({
    where: { NOT: { action: { startsWith: "security." } } },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, action: true, entityType: true, createdAt: true },
  });
  return (
    <OverviewPage
      events={events.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      }))}
    />
  );
}
