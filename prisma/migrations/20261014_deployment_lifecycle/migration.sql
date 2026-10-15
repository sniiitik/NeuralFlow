CREATE TYPE "DeploymentLifecycleState" AS ENUM ('pending', 'preparing', 'starting', 'healthy', 'active', 'failed', 'terminated');

ALTER TABLE "RegistryDeployment"
  ADD COLUMN "lifecycleState" "DeploymentLifecycleState",
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "lastError" TEXT;

CREATE UNIQUE INDEX "RegistryDeployment_idempotencyKey_key" ON "RegistryDeployment"("idempotencyKey");

CREATE TABLE "ServingRoute" (
  "familyId" TEXT NOT NULL PRIMARY KEY,
  "activeVersionId" TEXT NOT NULL,
  "candidateVersionId" TEXT,
  "candidateDeploymentId" TEXT,
  "trafficPercent" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServingRoute_traffic_check" CHECK ("trafficPercent" BETWEEN 0 AND 100),
  CONSTRAINT "ServingRoute_candidate_check" CHECK (("candidateVersionId" IS NULL AND "candidateDeploymentId" IS NULL AND "trafficPercent" = 0) OR ("candidateVersionId" IS NOT NULL AND "candidateDeploymentId" IS NOT NULL))
);

ALTER TABLE "ServingRoute" ADD CONSTRAINT "ServingRoute_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ModelFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServingRoute" ADD CONSTRAINT "ServingRoute_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServingRoute" ADD CONSTRAINT "ServingRoute_candidateVersionId_fkey" FOREIGN KEY ("candidateVersionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServingRoute" ADD CONSTRAINT "ServingRoute_candidateDeploymentId_fkey" FOREIGN KEY ("candidateDeploymentId") REFERENCES "RegistryDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Retain old rollout rows as history. They never represented a verified runtime action.
UPDATE "RegistryDeployment" SET "lifecycleState" = CASE
  WHEN "status" = 'failed' THEN 'failed'::"DeploymentLifecycleState"
  WHEN "status" = 'rolled_back' THEN 'terminated'::"DeploymentLifecycleState"
  ELSE NULL END;

-- Existing Phase 3 activations are the only legacy rows known to have loaded a runtime.
INSERT INTO "ServingRoute" ("familyId", "activeVersionId", "updatedAt")
SELECT DISTINCT ON (d."familyId") d."familyId", d."targetVersionId", CURRENT_TIMESTAMP
FROM "RegistryDeployment" d
WHERE EXISTS (SELECT 1 FROM "DeploymentEvent" e WHERE e."deploymentId" = d."id" AND e."action" = 'inference_activated')
ORDER BY d."familyId", d."createdAt" ASC, d."id" ASC;

UPDATE "RegistryDeployment" d SET "lifecycleState" = 'active'
WHERE EXISTS (SELECT 1 FROM "DeploymentEvent" e WHERE e."deploymentId" = d."id" AND e."action" = 'inference_activated');
