import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureBootstrapped = vi.fn();
const startAiReviewAllInBackground = vi.fn();

vi.mock("@/lib/services/bootstrap", () => ({
  ensureBootstrapped
}));

vi.mock("@/lib/services/ai-review-service", () => ({
  startAiReviewAllInBackground
}));

describe("POST /api/ai/review-all", () => {
  beforeEach(() => {
    ensureBootstrapped.mockResolvedValue(undefined);
    startAiReviewAllInBackground.mockReset();
  });

  it("启动后台 AI 完整复核时返回 202 和稳定 JSON", async () => {
    startAiReviewAllInBackground.mockResolvedValue({
      success: true,
      status: "started",
      started: true,
      provider: "glm",
      message: "AI 完整复核已开始，系统会持续更新进度。",
      progress: {
        status: "running",
        totalCandidates: 19,
        completedCount: 0,
        successCount: 0,
        failedCount: 0,
        pendingCount: 19,
        exportReady: false,
        startedAt: null,
        finishedAt: null,
        message: "AI 完整复核已开始，系统会持续更新进度。"
      }
    });

    const { POST } = await import("@/app/api/ai/review-all/route");
    const response = await POST(
      new Request("http://localhost/api/ai/review-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.success).toBe(true);
    expect(payload.status).toBe("started");
    expect(payload.progress?.status).toBe("running");
  });

  it("已经完成时返回 200，避免重复启动", async () => {
    startAiReviewAllInBackground.mockResolvedValue({
      success: true,
      status: "completed",
      started: false,
      provider: "glm",
      message: "当前批次的 AI 复核已完成，可直接导出完整版。",
      progress: {
        status: "completed",
        totalCandidates: 19,
        completedCount: 19,
        successCount: 19,
        failedCount: 0,
        pendingCount: 0,
        exportReady: true,
        startedAt: "2026-04-15T03:00:00.000Z",
        finishedAt: "2026-04-15T03:10:00.000Z",
        message: "AI 完整复核已完成，可以导出完整版 Excel。"
      }
    });

    const { POST } = await import("@/app/api/ai/review-all/route");
    const response = await POST(
      new Request("http://localhost/api/ai/review-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("completed");
    expect(payload.progress?.exportReady).toBe(true);
  });
});
