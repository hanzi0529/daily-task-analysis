import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureBootstrapped = vi.fn();
const reviewSampleRecords = vi.fn();

vi.mock("@/lib/services/bootstrap", () => ({
  ensureBootstrapped
}));

vi.mock("@/lib/services/ai-review-service", () => ({
  reviewSampleRecords
}));

describe("POST /api/ai/review-sample", () => {
  beforeEach(() => {
    ensureBootstrapped.mockResolvedValue(undefined);
    reviewSampleRecords.mockResolvedValue({
      success: true,
      status: "completed",
      provider: "mock",
      reviewedCount: 2,
      candidateCount: 5,
      items: [
        {
          recordId: "record_1",
          aiReviewed: true,
          aiSummary: "任务相关且有进展",
          aiConfidence: 0.86,
          aiReviewLabel: "任务相关且有进展",
          aiReviewReason: "输出了明确进展"
        }
      ],
      message: "已完成 2 条记录的 AI 抽样复核。"
    });
  });

  it("返回结构稳定，便于后续整体报告复用", async () => {
    const { POST } = await import("@/app/api/ai/review-sample/route");
    const response = await POST(
      new Request("http://localhost/api/ai/review-sample", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ limit: 10 })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      reviewedCount: 2,
      candidateCount: 5,
      provider: "mock"
    });
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items[0]).toHaveProperty("recordId");
    expect(payload.items[0]).toHaveProperty("aiSummary");
    expect(payload.items[0]).toHaveProperty("aiConfidence");
    expect(payload.items[0]).toHaveProperty("aiReviewLabel");
    expect(payload.items[0]).toHaveProperty("aiReviewReason");
  });
});
