-- CreateEnum
CREATE TYPE "ModelStatus" AS ENUM ('live', 'canary', 'rolling', 'shadow', 'archived');

-- CreateEnum
CREATE TYPE "DeploymentStrategy" AS ENUM ('canary', 'blue_green', 'shadow');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('pending', 'running', 'completed', 'rolled_back', 'failed');

-- CreateTable
CREATE TABLE "MLModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "artifactName" TEXT,
    "artifactPath" TEXT,
    "artifactSizeKb" INTEGER,
    "status" "ModelStatus" NOT NULL DEFAULT 'shadow',
    "trafficPercent" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "errorRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "driftScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MLModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "fromVersion" TEXT,
    "toVersion" TEXT NOT NULL,
    "strategy" "DeploymentStrategy" NOT NULL,
    "trafficPercent" INTEGER NOT NULL DEFAULT 0,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MLModel_name_version_key" ON "MLModel"("name", "version");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "MLModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
