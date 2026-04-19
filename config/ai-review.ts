export type AiReviewProviderName = "mock" | "glm" | "openai" | "deepseek" | "custom";

export const aiReviewConfig = {
  enabled: process.env.AI_REVIEW_ENABLED === "true",
  provider: (process.env.AI_REVIEW_PROVIDER || "mock") as AiReviewProviderName,
  sampleLimit: Number(process.env.AI_REVIEW_SAMPLE_LIMIT || 20),
  queue: {
    batchSize: Number(process.env.AI_REVIEW_BATCH_SIZE || 1),
    batchCooldownMs: Number(process.env.AI_REVIEW_BATCH_COOLDOWN_MS || 20000),
    rateLimitCooldownMs: Number(process.env.AI_REVIEW_RATE_LIMIT_COOLDOWN_MS || 60000)
  },
  candidateRules: {
    needAiReview: process.env.AI_REVIEW_INCLUDE_NEED_AI !== "false",
    mediumRisk: process.env.AI_REVIEW_INCLUDE_MEDIUM !== "false",
    managementAmbiguous: process.env.AI_REVIEW_INCLUDE_MANAGEMENT !== "false",
    focusSamples: process.env.AI_REVIEW_INCLUDE_FOCUS !== "false"
  },
  glm: {
    apiKey: process.env.GLM_API_KEY || "",
    model: process.env.GLM_MODEL || "glm-4.7",
    baseUrl:
      process.env.GLM_BASE_URL ||
      "https://open.bigmodel.cn/api/paas/v4/chat/completions"
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    baseUrl:
      process.env.OPENAI_BASE_URL ||
      "https://api.openai.com/v1/chat/completions"
  }
} as const;

export function normalizeAiSampleLimit(limit?: number) {
  const value = limit ?? aiReviewConfig.sampleLimit;
  if (!Number.isFinite(value)) {
    return 20;
  }

  return Math.max(1, Math.min(100, Math.floor(value)));
}

export function normalizeAiBatchSize(value?: number) {
  if (value == null || !Number.isFinite(value)) {
    return 3;
  }

  return Math.max(1, Math.min(10, Math.floor(value)));
}
