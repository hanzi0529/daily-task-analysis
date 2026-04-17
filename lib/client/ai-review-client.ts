export interface AiReviewProgressPayload {
  status: "idle" | "running" | "completed" | "failed" | "stalled" | "cancelled";
  totalCandidates: number;
  completedCount: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  exportReady: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastAttemptAt?: string | null;
  lastProgressAt?: string | null;
  cooldownUntil?: string | null;
  currentBatch?: number;
  totalBatches?: number;
  currentRecordId?: string | null;
  cancelRequested?: boolean;
  message?: string | null;
}

export interface AiReviewAllResponse {
  success: boolean;
  status: "started" | "running" | "completed" | "failed" | "skipped" | "no-data";
  started?: boolean;
  provider?: string;
  message?: string | null;
  progress: AiReviewProgressPayload;
}

export interface AiReviewProgressResponse {
  success: boolean;
  message?: string | null;
  progress: AiReviewProgressPayload;
}

export const EMPTY_AI_REVIEW_PROGRESS: AiReviewProgressPayload = {
  status: "idle",
  totalCandidates: 0,
  completedCount: 0,
  successCount: 0,
  failedCount: 0,
  pendingCount: 0,
  exportReady: true,
  startedAt: null,
  finishedAt: null,
  lastAttemptAt: null,
  lastProgressAt: null,
  cooldownUntil: null,
  currentBatch: 0,
  totalBatches: 0,
  currentRecordId: null,
  cancelRequested: false,
  message: "当前批次没有需要 AI 复核的记录，可直接导出。"
};

export async function startFullAiReview(
  options?: {
    force?: boolean;
    action?: "start" | "continue" | "restart" | "retry-failed" | "cancel";
  },
  fetchImpl: typeof fetch = fetch
): Promise<AiReviewAllResponse> {
  const response = await fetchImpl("/api/ai/review-all", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      force: options?.force ?? false,
      action: options?.action
    })
  });

  const payload = (await response.json().catch(() => null)) as Partial<AiReviewAllResponse> | null;

  return {
    success: payload?.success ?? response.ok,
    status: payload?.status ?? "failed",
    started: payload?.started ?? false,
    provider: payload?.provider,
    message: payload?.message ?? "AI 完整复核启动失败，请稍后重试。",
    progress: payload?.progress ?? EMPTY_AI_REVIEW_PROGRESS
  };
}

export async function fetchAiReviewProgress(
  fetchImpl: typeof fetch = fetch
): Promise<AiReviewProgressResponse> {
  try {
    const response = await fetchImpl("/api/ai/review-progress", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | Partial<AiReviewProgressResponse>
      | null;

    return {
      success: payload?.success ?? response.ok,
      message: payload?.message ?? null,
      progress: payload?.progress ?? EMPTY_AI_REVIEW_PROGRESS
    };
  } catch {
    return {
      success: false,
      message: "AI 复核进度暂时不可用。",
      progress: EMPTY_AI_REVIEW_PROGRESS
    };
  }
}
