import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordListItem } from "@/tests/fixtures/report-samples";

const ensureBootstrapped = vi.fn();
const getRecordListV2 = vi.fn();

vi.mock("@/lib/services/bootstrap", () => ({
  ensureBootstrapped
}));

vi.mock("@/lib/services/query-service-v2", () => ({
  getRecordListV2
}));

describe("GET /api/records", () => {
  beforeEach(() => {
    ensureBootstrapped.mockResolvedValue(undefined);
    getRecordListV2.mockResolvedValue([
      {
        ...createRecordListItem({
          riskLevel: "medium",
          issueCount: 2,
          needAiReview: true,
          issueTitles: ["内容过短", "任务匹配较弱"]
        }),
        primaryIssueTypes: ["内容完整性", "任务匹配"],
        riskReasons: ["内容过短", "任务匹配较弱"],
        aiSummary: null,
        aiConfidence: null,
        futureField: "compatible"
      }
    ]);
  });

  it("返回 records.data 与 meta 结构稳定", async () => {
    const { GET } = await import("@/app/api/records/route");
    const response = await GET(new Request("http://localhost/api/records"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toHaveProperty("data");
    expect(payload).toHaveProperty("meta");
    expect(payload.meta).toHaveProperty("count");
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data[0]).toMatchObject({
      memberName: "张三",
      riskLevel: "medium",
      needAiReview: true
    });
    expect(payload.data[0].futureField).toBe("compatible");
  });
});
