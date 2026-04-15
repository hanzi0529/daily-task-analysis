import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureBootstrapped = vi.fn();
const generateBatchReport = vi.fn();

vi.mock("@/lib/services/bootstrap", () => ({
  ensureBootstrapped
}));

vi.mock("@/lib/services/ai-report-service", () => ({
  generateBatchReport
}));

describe("GET /api/ai/report", () => {
  beforeEach(() => {
    ensureBootstrapped.mockResolvedValue(undefined);
    generateBatchReport.mockResolvedValue({
      success: true,
      skipped: false,
      reason: null,
      status: "completed",
      provider: "mock",
      report: {
        overview: "整体风险可控。",
        majorFindings: ["高风险主要集中在少数人员。"],
        riskInsights: ["任务匹配较弱较集中。"],
        focusPeopleSuggestions: ["建议优先关注张三。"],
        focusTaskSuggestions: ["建议关注接口联调。"],
        managementSuggestions: ["建议抽样复核重点任务。"],
        reportingSummary: "建议管理层聚焦重点样本。",
        generatedAt: "2026-04-14T08:00:00.000Z"
      },
      message: "AI 管理总结已生成。"
    });
  });

  it("返回 batchAiReport 结构稳定", async () => {
    const { GET } = await import("@/app/api/ai/report/route");
    const response = await GET(new Request("http://localhost/api/ai/report"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.report).toHaveProperty("overview");
    expect(payload.report).toHaveProperty("majorFindings");
    expect(payload.report).toHaveProperty("managementSuggestions");
    expect(payload.report).toHaveProperty("reportingSummary");
  });

  it("provider 降级时也会返回合法 JSON", async () => {
    generateBatchReport.mockResolvedValueOnce({
      success: false,
      skipped: true,
      reason: "provider_error",
      status: "skipped",
      provider: "glm",
      report: null,
      message: "AI总结暂时未生成，请稍后重试。"
    });

    const { GET } = await import("@/app/api/ai/report/route");
    const response = await GET(new Request("http://localhost/api/ai/report"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.skipped).toBe(true);
    expect(payload.reason).toBe("provider_error");
    expect(payload.report).toBeNull();
  });

  it("空数据时会返回合法 JSON，而不是抛裸异常", async () => {
    generateBatchReport.mockResolvedValueOnce({
      success: false,
      skipped: true,
      reason: "no_data",
      status: "no-data",
      provider: "mock",
      report: null,
      message: "AI总结暂时未生成，请稍后重试。"
    });

    const { GET } = await import("@/app/api/ai/report/route");
    const response = await GET(new Request("http://localhost/api/ai/report"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reason).toBe("no_data");
    expect(payload.report).toBeNull();
  });

  it("即使 service 抛错，route 也会返回可解释 JSON", async () => {
    generateBatchReport.mockRejectedValueOnce(new Error("429 Too Many Requests"));

    const { GET } = await import("@/app/api/ai/report/route");
    const response = await GET(new Request("http://localhost/api/ai/report"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(false);
    expect(payload.skipped).toBe(true);
    expect(payload.reason).toBe("provider_error");
    expect(payload.report).toBeNull();
  });
});
