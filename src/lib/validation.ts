import { z } from "zod";

const modelName = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Use letters, numbers, dots, underscores, or hyphens.");
const versionName = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/);

export const registerModelSchema = z.object({
  name: modelName,
  version: versionName,
  framework: z.string().trim().min(1).max(80),
  owner: z.string().trim().min(1).max(120).default("Unassigned"),
  description: z.string().trim().max(2000).default(""),
  runtime: z.string().trim().min(1).max(80).default("cpu-small"),
  replicas: z.coerce.number().int().min(1).max(128).default(1),
  status: z.enum(["live", "canary", "rolling", "shadow"]).default("shadow"),
});

export const familyCreateSchema = z.object({
  name: modelName,
  owner: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
});

export const familyUpdateSchema = z.object({
  owner: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const deploymentCreateSchema = z.object({
  modelId: z.string().min(1),
  fromVersion: versionName.optional(),
  toVersion: versionName,
  strategy: z.enum(["canary", "blue-green", "shadow"]).default("canary"),
  trafficPercent: z.number().int().min(0).max(100).default(10),
  idempotencyKey: z.string().uuid().optional(),
});

export const trafficUpdateSchema = z.object({
  trafficPercent: z.number().int().min(0).max(100),
});

const irisFeature = z.number().finite().positive().max(20);
export const inferenceInputSchema = z.object({
  deploymentId: z.string().min(1).optional(),
  familyId: z.string().min(1).optional(),
  features: z.object({
    sepal_length: irisFeature,
    sepal_width: irisFeature,
    petal_length: irisFeature,
    petal_width: irisFeature,
  }).strict(),
}).strict().refine((value) => Boolean(value.deploymentId) !== Boolean(value.familyId), "Provide either deploymentId or familyId.");

export const inferenceActivationSchema = z.object({ versionId: z.string().min(1) }).strict();
