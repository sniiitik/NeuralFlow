const [familyId, deploymentId] = process.argv.slice(2);
const { getPrisma } = await import("../src/lib/prisma");
const prisma = getPrisma();
const route = await prisma.servingRoute.findUniqueOrThrow({ where: { familyId } });
const deployment = await prisma.registryDeployment.findUniqueOrThrow({ where: { id: deploymentId } });
console.log(JSON.stringify({ activeVersionId: route.activeVersionId, status: deployment.status }));
await prisma.$disconnect();
