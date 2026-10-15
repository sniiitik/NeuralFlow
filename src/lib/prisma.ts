import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
};

export function getPrisma(): PrismaClient {
    if (globalForPrisma.prisma) return globalForPrisma.prisma;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL must be set before creating PrismaClient.");
    }

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
        log: ["warn", "error"],
    });

    globalForPrisma.prisma = prisma;
    return prisma;
}
