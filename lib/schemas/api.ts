import { z } from "zod";

export const exportQuerySchema = z.object({
  datasetId: z.string().optional()
});

export const recordsQuerySchema = z.object({
  datasetId: z.string().optional(),
  date: z.string().optional(),
  memberName: z.string().optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  needAiReview: z.enum(["true", "false"]).optional()
});

export const aiReviewSampleRequestSchema = z.object({
  datasetId: z.string().optional(),
  limit: z.number().int().positive().max(100).optional()
});
