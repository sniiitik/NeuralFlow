import "dotenv/config";
import { initialModels } from "../src/lib/mock-data";
import { getPrisma } from "../src/lib/prisma";

async function main() {
  const prisma = getPrisma();
  for (const model of initialModels) {
    const family = await prisma.modelFamily.upsert({
      where: { name: model.name },
      create: { id: `family_demo_${model.name}`, name: model.name, owner: model.owner, description: model.description },
      update: {},
    });
    const existing = await prisma.modelVersion.findUnique({ where: { familyId_version: { familyId: family.id, version: model.version } } });
    if (existing) continue;
    await prisma.modelVersion.create({ data: {
      id: model.id,
      familyId: family.id,
      version: model.version,
      framework: model.framework,
      description: model.description,
      runtime: model.runtime,
      replicas: model.replicas,
      createdAt: new Date(model.createdAt),
      legacyArtifactName: model.artifactName,
      legacyArtifactSizeKb: model.artifactSizeKb,
      state: { create: {
        status: model.status,
        trafficPercent: model.trafficPercent,
        lastDeployedAt: new Date(model.lastDeployedAt),
      } },
    } });
  }
  console.log("Optional demo model seed complete.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
