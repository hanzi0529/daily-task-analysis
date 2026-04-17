import { z } from "zod";

export const exportQuerySchema = z.object({
  datasetId: z.string().optional()
});

export const recordsQuerySchema = z.object({
  datasetId: z.string().optional(),
  date: z.string().optional(),
  memberName: z.string().optional(),
  riskLevel: z.enum(["normal", "low", "medium", "high"]).optional(),
  needAiReview: z.enum(["true", "false"]).optional()
});

export const aiReviewSampleRequestSchema = z.object({
  datasetId: z.string().optional(),
  limit: z.number().int().positive().max(100).optional()
});

export const aiReviewAllRequestSchema = z.object({
  datasetId: z.string().optional(),
  force: z.boolean().optional(),
  action: z
    .enum(["start", "continue", "restart", "retry-failed", "cancel"])
    .optional()
});

export const peopleQuerySchema = z.object({
  datasetId: z.string().optional(),
  memberName: z.string().optional(),
  riskLevel: z.enum(["normal", "low", "medium", "high"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  needAiReview: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional()
});
