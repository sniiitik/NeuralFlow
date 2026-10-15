const [familyId] = process.argv.slice(2);
const { predictFamily } = await import("../src/lib/inference");
const { getPrisma } = await import("../src/lib/prisma");
const result = await predictFamily(familyId, { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2 });
console.log(JSON.stringify({ modelVersion: result.modelVersion, servingSlot: result.servingSlot }));
await getPrisma().$disconnect();
