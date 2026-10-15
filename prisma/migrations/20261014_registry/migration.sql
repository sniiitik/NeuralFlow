-- CreateEnum
CREATE TYPE "ArtifactFormat" AS ENUM ('json', 'safetensors');

-- CreateTable
CREATE TABLE "ModelFamily" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "runtime" TEXT NOT NULL DEFAULT 'cpu-small',
    "replicas" INTEGER NOT NULL DEFAULT 1,
    "legacyArtifactName" TEXT,
    "legacyArtifactSizeKb" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRuntimeState" (
    "versionId" TEXT NOT NULL,
    "status" "ModelStatus" NOT NULL DEFAULT 'shadow',
    "trafficPercent" INTEGER NOT NULL DEFAULT 0,
    "requestsPerSecond" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "errorRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "driftScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastDeployedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRuntimeState_pkey" PRIMARY KEY ("versionId")
);

-- CreateTable
CREATE TABLE "ModelArtifact" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "format" "ArtifactFormat" NOT NULL,
    "mediaType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryDeployment" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "stableVersionId" TEXT,
    "targetVersionId" TEXT NOT NULL,
    "strategy" "DeploymentStrategy" NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'pending',
    "trafficPercent" INTEGER NOT NULL DEFAULT 0,
    "stableLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "canaryLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentEvent" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelFamily_name_key" ON "ModelFamily"("name");

-- CreateIndex
CREATE INDEX "ModelVersion_familyId_idx" ON "ModelVersion"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelVersion_familyId_version_key" ON "ModelVersion"("familyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ModelArtifact_versionId_key" ON "ModelArtifact"("versionId");

-- CreateIndex
CREATE INDEX "ModelArtifact_sha256_idx" ON "ModelArtifact"("sha256");

-- CreateIndex
CREATE INDEX "RegistryDeployment_familyId_createdAt_idx" ON "RegistryDeployment"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "RegistryDeployment_targetVersionId_idx" ON "RegistryDeployment"("targetVersionId");

-- CreateIndex
CREATE INDEX "DeploymentEvent_deploymentId_createdAt_idx" ON "DeploymentEvent"("deploymentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "ModelVersion" ADD CONSTRAINT "ModelVersion_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ModelFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRuntimeState" ADD CONSTRAINT "ModelRuntimeState_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelArtifact" ADD CONSTRAINT "ModelArtifact_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryDeployment" ADD CONSTRAINT "RegistryDeployment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ModelFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryDeployment" ADD CONSTRAINT "RegistryDeployment_stableVersionId_fkey" FOREIGN KEY ("stableVersionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryDeployment" ADD CONSTRAINT "RegistryDeployment_targetVersionId_fkey" FOREIGN KEY ("targetVersionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentEvent" ADD CONSTRAINT "DeploymentEvent_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "RegistryDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill without changing or deleting the legacy tables. Reuse legacy model IDs
-- as version IDs so existing API references remain valid after the cutover.
INSERT INTO "ModelFamily" ("id", "name", "owner", "description", "createdAt", "updatedAt")
SELECT 'family_' || md5(latest."name"), latest."name", latest."team", '',
       first_seen."createdAt", latest."updatedAt"
FROM (SELECT DISTINCT ON ("name") "name", "team", "updatedAt"
      FROM "MLModel" ORDER BY "name", "updatedAt" DESC, "id") AS latest
JOIN (SELECT "name", min("createdAt") AS "createdAt" FROM "MLModel" GROUP BY "name") AS first_seen
  ON first_seen."name" = latest."name";

INSERT INTO "ModelVersion" ("id", "familyId", "version", "framework", "description", "runtime", "replicas", "legacyArtifactName", "legacyArtifactSizeKb", "createdAt")
SELECT m."id", 'family_' || md5(m."name"), m."version", m."framework", '', 'cpu-small', 1,
       m."artifactName", m."artifactSizeKb", m."createdAt"
FROM "MLModel" AS m;

INSERT INTO "ModelRuntimeState" ("versionId", "status", "trafficPercent", "requestsPerSecond", "latencyMs", "errorRate", "driftScore", "lastDeployedAt", "updatedAt")
SELECT m."id", m."status", m."trafficPercent", 0, m."latencyMs", m."errorRate", m."driftScore",
       m."updatedAt", m."updatedAt"
FROM "MLModel" AS m;

-- Historical rollout text may mention versions never registered as rows. Create
-- metadata-only placeholders so every migrated deployment has valid version FKs.
INSERT INTO "ModelVersion" ("id", "familyId", "version", "framework", "description", "runtime", "replicas", "createdAt")
SELECT DISTINCT ON (m."name", d."toVersion")
       'legacy_version_' || md5(m."name" || ':' || d."toVersion"),
       'family_' || md5(m."name"), d."toVersion", m."framework", '', 'cpu-small', 1, d."createdAt"
FROM "Deployment" AS d JOIN "MLModel" AS m ON m."id" = d."modelId"
ORDER BY m."name", d."toVersion", d."createdAt"
ON CONFLICT ("familyId", "version") DO NOTHING;

INSERT INTO "ModelVersion" ("id", "familyId", "version", "framework", "description", "runtime", "replicas", "createdAt")
SELECT DISTINCT ON (m."name", d."fromVersion")
       'legacy_version_' || md5(m."name" || ':' || d."fromVersion"),
       'family_' || md5(m."name"), d."fromVersion", m."framework", '', 'cpu-small', 1, d."createdAt"
FROM "Deployment" AS d JOIN "MLModel" AS m ON m."id" = d."modelId"
WHERE d."fromVersion" IS NOT NULL
ORDER BY m."name", d."fromVersion", d."createdAt"
ON CONFLICT ("familyId", "version") DO NOTHING;

INSERT INTO "ModelRuntimeState" ("versionId", "status", "trafficPercent", "requestsPerSecond", "latencyMs", "errorRate", "driftScore", "updatedAt")
SELECT v."id", 'shadow', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP
FROM "ModelVersion" AS v
LEFT JOIN "ModelRuntimeState" AS s ON s."versionId" = v."id"
WHERE s."versionId" IS NULL;

INSERT INTO "RegistryDeployment" ("id", "familyId", "stableVersionId", "targetVersionId", "strategy", "status", "trafficPercent", "stableLatencyMs", "canaryLatencyMs", "createdAt", "updatedAt")
SELECT d."id", target."familyId", stable."id", target."id", d."strategy", d."status",
       d."trafficPercent", m."latencyMs", m."latencyMs", d."createdAt", d."updatedAt"
FROM "Deployment" AS d
JOIN "MLModel" AS m ON m."id" = d."modelId"
JOIN "ModelVersion" AS target ON target."familyId" = 'family_' || md5(m."name") AND target."version" = d."toVersion"
LEFT JOIN "ModelVersion" AS stable ON stable."familyId" = target."familyId" AND stable."version" = d."fromVersion";

INSERT INTO "DeploymentEvent" ("id", "deploymentId", "action", "details", "createdAt")
SELECT 'legacy_event_' || md5(d."id"), d."id", 'legacy_import',
       jsonb_build_object('source', 'Deployment'), d."createdAt"
FROM "Deployment" AS d;

ALTER TABLE "ModelVersion" ADD CONSTRAINT "ModelVersion_replicas_check" CHECK ("replicas" BETWEEN 1 AND 128);
ALTER TABLE "ModelArtifact" ADD CONSTRAINT "ModelArtifact_size_check" CHECK ("byteSize" BETWEEN 1 AND 16777216);
ALTER TABLE "ModelArtifact" ADD CONSTRAINT "ModelArtifact_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- Version identity and artifact metadata cannot be rewritten or removed.
CREATE FUNCTION reject_registry_immutable_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER model_version_immutable BEFORE UPDATE OR DELETE ON "ModelVersion"
FOR EACH ROW EXECUTE FUNCTION reject_registry_immutable_mutation();
CREATE TRIGGER model_artifact_immutable BEFORE UPDATE OR DELETE ON "ModelArtifact"
FOR EACH ROW EXECUTE FUNCTION reject_registry_immutable_mutation();
