import { aiReviewConfig } from "@/config/ai-review";

export const aiReportConfig = {
  enabled: process.env.AI_REPORT_ENABLED === "true",
  provider: aiReviewConfig.provider,
  exampleLimit: Number(process.env.AI_REPORT_EXAMPLE_LIMIT || 5)
} as const;
