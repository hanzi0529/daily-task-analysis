export type AiReviewProviderName = "mock" | "glm" | "openai";

export const aiReviewConfig = {
  enabled: process.env.AI_REVIEW_ENABLED === "true",
  provider: (process.env.AI_REVIEW_PROVIDER || "mock") as AiReviewProviderName,
  sampleLimit: Number(process.env.AI_REVIEW_SAMPLE_LIMIT || 20),
  candidateRules: {
    needAiReview: process.env.AI_REVIEW_INCLUDE_NEED_AI !== "false",
    mediumRisk: process.env.AI_REVIEW_INCLUDE_MEDIUM !== "false",
    managementAmbiguous:
      process.env.AI_REVIEW_INCLUDE_MANAGEMENT !== "false",
    focusSamples: process.env.AI_REVIEW_INCLUDE_FOCUS !== "false"
  }
} as const;

export function normalizeAiSampleLimit(limit?: number) {
  const value = limit ?? aiReviewConfig.sampleLimit;
  if (!Number.isFinite(value)) {
    return 20;
  }

  return Math.max(1, Math.min(100, Math.floor(value)));
}
