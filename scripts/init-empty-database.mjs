import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// The Phase 4 directory sorts before Phase 2, although its SQL depends on
// Phase 2 tables. These are the original, unchanged migration directories.
const migrationOrder = [
  "20260526163757_init",
  "20261014_registry",
  "20261014_deployment_lifecycle",
  "20261014_z_advanced_routing",
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsPath = path.join(root, "prisma", "migrations");
const prisma = path.join(root, "node_modules", ".bin", "prisma");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must point to a new, empty PostgreSQL database.");
}

const target = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(target.protocol)) {
  throw new Error("DATABASE_URL must use PostgreSQL.");
}
if (target.searchParams.has("schema") && target.searchParams.get("schema") !== "public") {
  throw new Error("The empty-database bootstrap currently supports only the public schema.");
}

const migrationDirectories = new Set(
  (await readdir(migrationsPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);
for (const name of migrationOrder) {
  if (!migrationDirectories.has(name)) {
    throw new Error(`Required migration is missing: ${name}`);
  }
}

const migrations = await Promise.all(
  migrationOrder.map(async (name) => ({
    name,
    sql: await readFile(path.join(migrationsPath, name, "migration.sql"), "utf8"),
  })),
);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  // Hold a transaction while checking emptiness and applying every SQL file.
  // Any SQL error rolls back the entire schema bootstrap.
  await client.query("BEGIN");
  const existing = await client.query(`
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    ORDER BY c.relname LIMIT 5
  `);
  const existingTypes = await client.query(`
    SELECT t.typname FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
    ORDER BY t.typname LIMIT 5
  `);
  if (existing.rowCount || existingTypes.rowCount) {
    throw new Error(
      `Refusing to initialize a nonempty database (${[...existing.rows, ...existingTypes.rows]
        .map((row) => row.relname ?? row.typname)
        .join(", ")}). Use npm run db:deploy for an existing database.`,
    );
  }

  for (const { name, sql } of migrations) {
    console.log(`Applying ${name}`);
    await client.query(sql);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

// Ask Prisma to create its own tracking records and checksums for the
// unmodified historical files. No existing migration tracking is changed.
for (const { name } of migrations) {
  execFileSync(prisma, ["migrate", "resolve", "--applied", name], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
}

// This also handles any future migrations that sort after the baseline.
execFileSync(prisma, ["migrate", "deploy"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
console.log(`Initialized empty database ${decodeURIComponent(target.pathname.slice(1))}.`);
