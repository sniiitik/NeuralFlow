CREATE TYPE "RuntimeSlot" AS ENUM ('blue', 'green');
CREATE TYPE "InferenceRequestRole" AS ENUM ('stable', 'candidate', 'shadow');
CREATE TYPE "InferenceRequestStatus" AS ENUM ('success', 'failed', 'skipped');

ALTER TABLE "RegistryDeployment"
  ADD COLUMN "stableSlot" "RuntimeSlot",
  ADD COLUMN "candidateSlot" "RuntimeSlot",
  ADD COLUMN "promotedRouteRevision" INTEGER;

ALTER TABLE "ServingRoute"
  ADD COLUMN "activeSlot" "RuntimeSlot" NOT NULL DEFAULT 'blue',
  ADD COLUMN "candidateSlot" "RuntimeSlot";

-- Historical Phase 4 routes used the blue runtime. Any unfinished candidate
-- is assigned the newly dedicated green runtime and reloaded on demand.
UPDATE "ServingRoute" SET "candidateSlot" = 'green'
WHERE "candidateVersionId" IS NOT NULL;
UPDATE "RegistryDeployment" SET "stableSlot" = 'blue', "candidateSlot" = 'green'
WHERE "status" = 'running' AND "lifecycleState" = 'active' AND "stableVersionId" IS NOT NULL;

ALTER TABLE "ServingRoute" ADD CONSTRAINT "ServingRoute_slots_check"
CHECK (("candidateVersionId" IS NULL AND "candidateSlot" IS NULL)
    OR ("candidateVersionId" IS NOT NULL AND "candidateSlot" IS NOT NULL AND "candidateSlot" <> "activeSlot"));

CREATE TABLE "InferenceRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "deploymentId" TEXT,
  "versionId" TEXT NOT NULL,
  "slot" "RuntimeSlot" NOT NULL,
  "role" "InferenceRequestRole" NOT NULL,
  "status" "InferenceRequestStatus" NOT NULL,
  "inferenceMs" DOUBLE PRECISION,
  "prediction" TEXT,
  "probabilities" JSONB,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InferenceRequest_deploymentId_role_status_idx" ON "InferenceRequest"("deploymentId", "role", "status");
CREATE INDEX "InferenceRequest_familyId_createdAt_idx" ON "InferenceRequest"("familyId", "createdAt");
CREATE INDEX "InferenceRequest_requestId_idx" ON "InferenceRequest"("requestId");
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ModelFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "RegistryDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
