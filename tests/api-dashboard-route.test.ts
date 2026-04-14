import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureBootstrapped = vi.fn();
const getDashboardApiPayload = vi.fn();

vi.mock("@/lib/services/bootstrap", () => ({
  ensureBootstrapped
}));

vi.mock("@/lib/services/dashboard-api-service", () => ({
  getDashboardApiPayload
}));

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    ensureBootstrapped.mockResolvedValue(undefined);
    getDashboardApiPayload.mockResolvedValue({
      summary: {
        datasetId: "dataset_test",
        totalRecords: 5
      },
      metrics: {
        totalRecords: 5,
        anomalyRecords: 1,
        anomalyRate: 20,
        highRiskPeopleCount: 1,
        needAiReviewCount: 2,
        totalHours: 36
      },
      charts: {
        riskTypeDistribution: [],
        riskLevelDistribution: [],
        dailyTrend: []
      },
      topPeople: [],
      topTasks: [],
      managementSummary: ["异常率处于可控范围"],
      futureField: {
        preserved: true
      }
    });
  });

  it("返回核心结构稳定，即使未来字段增加也不破坏当前结构", async () => {
    const { GET } = await import("@/app/api/dashboard/route");
    const response = await GET(new Request("http://localhost/api/dashboard"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toHaveProperty("summary");
    expect(payload).toHaveProperty("metrics");
    expect(payload).toHaveProperty("charts");
    expect(payload).toHaveProperty("topPeople");
    expect(payload).toHaveProperty("topTasks");
    expect(payload).toHaveProperty("managementSummary");
    expect(Array.isArray(payload.managementSummary)).toBe(true);
    expect(payload.futureField).toEqual({ preserved: true });
  });
});
