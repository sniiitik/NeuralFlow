const [deploymentId] = process.argv.slice(2);
const { listDeployments, getDeployment } = await import("../src/lib/deployments");
const { getPrisma } = await import("../src/lib/prisma");
await listDeployments();
console.log(JSON.stringify(await getDeployment(deploymentId)));
await getPrisma().$disconnect();
