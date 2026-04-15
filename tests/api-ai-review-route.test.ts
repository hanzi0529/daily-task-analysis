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
          aiSummary: "这条日报与任务相关，但结果表达还有补充空间。",
          aiConfidence: 0.86,
          aiReviewLabel: "结果不明确",
          aiSuggestion: "建议补充当前已完成的具体结果或下一步动作。",
          aiReviewReason: "当前文本体现了动作，但结果与结论表达较弱。"
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
    expect(payload.items[0]).toHaveProperty("aiSuggestion");
    expect(payload.items[0]).toHaveProperty("aiReviewReason");
  });

  it("未配置真实 provider 时，也会返回 skipped 而不是报错", async () => {
    reviewSampleRecords.mockResolvedValueOnce({
      success: true,
      status: "skipped",
      provider: "glm",
      reviewedCount: 0,
      candidateCount: 5,
      items: [],
      message: "AI provider glm 当前未配置，已跳过抽样复核。"
    });

    const { POST } = await import("@/app/api/ai/review-sample/route");
    const response = await POST(
      new Request("http://localhost/api/ai/review-sample", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("skipped");
    expect(payload.message).toContain("跳过");
  });

  it("即使 AI 调用失败，API 也能返回可解释响应", async () => {
    reviewSampleRecords.mockResolvedValueOnce({
      success: true,
      status: "completed",
      provider: "mock",
      reviewedCount: 0,
      candidateCount: 2,
      items: [
        {
          recordId: "record_1",
          aiReviewed: false,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null,
          aiReviewReason: "provider failed"
        }
      ],
      message: "已完成 0 条记录的 AI 抽样复核。"
    });

    const { POST } = await import("@/app/api/ai/review-sample/route");
    const response = await POST(
      new Request("http://localhost/api/ai/review-sample", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items[0].aiReviewed).toBe(false);
    expect(payload.items[0].aiReviewReason).toBe("provider failed");
  });
});

