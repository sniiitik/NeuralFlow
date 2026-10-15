import { getPrisma } from "../src/lib/prisma";

const [versionId, deploymentId] = process.argv.slice(2);
const prisma = getPrisma();
const [version, deployment] = await Promise.all([
  prisma.modelVersion.findUnique({ where: { id: versionId } }),
  prisma.registryDeployment.findUnique({ where: { id: deploymentId } }),
]);
console.log(JSON.stringify({ versionId: version?.id, deploymentId: deployment?.id }));
await prisma.$disconnect();
