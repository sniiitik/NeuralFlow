ALTER TABLE "InferenceRequest"
  ADD COLUMN "gatewayMs" DOUBLE PRECISION,
  ADD COLUMN "features" JSONB,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'user';
CREATE INDEX "InferenceRequest_createdAt_status_idx" ON "InferenceRequest"("createdAt", "status");
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_gatewayMs_check"
  CHECK ("gatewayMs" IS NULL OR "gatewayMs" >= 0);
ALTER TABLE "InferenceRequest" ADD CONSTRAINT "InferenceRequest_source_check"
  CHECK ("source" IN ('user', 'demo'));

CREATE TABLE "FeatureReference" (
  "versionId" TEXT NOT NULL PRIMARY KEY,
  "mean" JSONB NOT NULL,
  "scale" JSONB NOT NULL,
  "sampleCount" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeatureReference_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FeatureReference_sampleCount_check" CHECK ("sampleCount" >= 30)
);

CREATE TABLE "RuntimeHealthSample" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slot" "RuntimeSlot" NOT NULL,
  "healthy" BOOLEAN NOT NULL,
  "latencyMs" DOUBLE PRECISION,
  "errorCode" TEXT,
  "bucketAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuntimeHealthSample_latencyMs_check" CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0)
);
CREATE UNIQUE INDEX "RuntimeHealthSample_slot_bucketAt_key" ON "RuntimeHealthSample"("slot", "bucketAt");
CREATE INDEX "RuntimeHealthSample_createdAt_idx" ON "RuntimeHealthSample"("createdAt");

CREATE TABLE "AlertEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fingerprint" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "observed" DOUBLE PRECISION NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AlertEvent_fingerprint_key" ON "AlertEvent"("fingerprint");
CREATE INDEX "AlertEvent_createdAt_idx" ON "AlertEvent"("createdAt");
