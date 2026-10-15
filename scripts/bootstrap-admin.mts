import { z } from "zod";

const email = z.email().parse(process.env.NEURALFLOW_ADMIN_EMAIL);
const password = z.string().min(16).max(256).parse(process.env.NEURALFLOW_ADMIN_PASSWORD);
process.env.NEURALFLOW_BOOTSTRAP = "1";
const { getPrisma } = await import("../src/lib/prisma");
const { auth } = await import("../src/lib/auth");
const prisma = getPrisma();

if (await prisma.user.count() !== 0) throw new Error("Bootstrap refused: users already exist. Provision later accounts through an administrator workflow.");
const result = await auth.api.signUpEmail({ body: { name: "NeuralFlow Administrator", email, password } });
if (!result?.user?.id) throw new Error("Administrator sign-up failed.");
await prisma.user.update({ where: { id: result.user.id }, data: { role: "admin", emailVerified: true } });
await prisma.auditLog.create({ data: { actor: result.user.id, action: "security.admin_bootstrap", entityType: "user",
  entityId: result.user.id, details: { email } } });
console.log(`Administrator created: ${email}`);
await prisma.$disconnect();
