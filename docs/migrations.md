# Migration history and fresh database setup

## Dependency order

| Order | Migration | Dependency |
| --- | --- | --- |
| 1 | `20260526163757_init` | Creates legacy model and deployment tables and shared enums. |
| 2 | `20261014_registry` | Creates model families, immutable versions, artifacts, registry deployments, events, and audit logs; backfills legacy rows. |
| 3 | `20261014_deployment_lifecycle` | Adds lifecycle fields and `ServingRoute`; requires registry tables. |
| 4 | `20261014_z_advanced_routing` | Adds runtime slots and `InferenceRequest`; requires lifecycle tables. |
| 5 | `20261015_observability` | Adds inference telemetry fields, feature references, runtime health samples, and alert events. |
| 6 | `20261016_security_identity` | Adds Better Auth user, session, account, and verification tables without altering existing model data. |

The historical directory names sort Phase 4 before Phase 2. These migrations have already been applied to existing databases in dependency order. Renaming or rewriting their applied files would change Prisma migration checksums or names and risk existing environments, so the files remain unchanged.

## Completely empty database

Create a new PostgreSQL database, set `DATABASE_URL` to it, then run:

```bash
npm ci
npm run db:init
npx prisma migrate status
npm run dev
```

`db:init` reads and executes the four original SQL files in dependency order within one PostgreSQL transaction. It refuses a database containing any public table, view, sequence, or enum. After the SQL commits, it uses `prisma migrate resolve --applied` for each original directory so Prisma stores its normal migration name and checksum, then runs `prisma migrate deploy` for any future pending migrations. It does not seed models or touch artifact files. Run it only once per empty database. If SQL fails, the transaction rolls back. If tracking fails after SQL commits, **stop** and inspect the database and `_prisma_migrations`; do not rerun the bootstrap or reset a database containing data.

For an existing database, run `npm run db:deploy`. Check `npx prisma migrate status` first if its history is uncertain. Never run `db:init` on it; the script will refuse it. Back up PostgreSQL and `ARTIFACT_STORAGE_DIR` together before normal upgrades.

## Authoring a new migration without `migrate dev`

The historical order prevents Prisma's shadow-database replay used by `prisma migrate dev`. Author additive SQL in a **new directory whose name sorts after every existing migration**. Update `schema.prisma` to match. Run `prisma validate`, then initialize a new disposable database with `db:init` and verify `migrate status`, tables, constraints, and application tests there. Apply the exact reviewed SQL with `db:deploy` to an existing environment only after those checks and a database backup. Never alter an applied directory or use `db push` to bypass tracking. This is the process used for `20261015_observability`: its SQL was first deployed to a disposable database with existing model records and then tested. A future canonical history would still need a separate review before `migrate dev` becomes safe.
