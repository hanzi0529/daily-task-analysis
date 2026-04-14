import { z } from "zod";

export const datasetIdSchema = z.object({
  datasetId: z.string().min(1)
});

export const importLatestSchema = z.object({
  strategy: z.enum(["latest"]).default("latest")
});

export const uploadResponseSchema = z.object({
  success: z.boolean(),
  datasetId: z.string(),
  fileId: z.string(),
  fileName: z.string()
});
