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

  it("未配置真实 provider 时，也会返回 skipped 而不是报错", async () => {
    generateBatchReport.mockResolvedValueOnce({
      success: true,
      status: "skipped",
      provider: "openai",
      report: null,
      message: "AI provider openai 当前未配置，已跳过管理总结生成。"
    });

    const { GET } = await import("@/app/api/ai/report/route");
    const response = await GET(new Request("http://localhost/api/ai/report"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("skipped");
    expect(payload.message).toContain("跳过");
  });

  it("空数据时会返回可解释的降级响应", async () => {
    generateBatchReport.mockResolvedValueOnce({
      success: false,
      status: "no-data",
      provider: "mock",
      report: null,
      message: "当前没有可用于生成 AI 管理总结的分析结果。"
    });

    const { GET } = await import("@/app/api/ai/report/route");
    const response = await GET(new Request("http://localhost/api/ai/report"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.status).toBe("no-data");
    expect(payload.report).toBeNull();
  });
});
