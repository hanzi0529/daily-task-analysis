import { describe, expect, it, vi } from "vitest";

import { fetchDashboardAiReport } from "@/lib/client/fetch-dashboard-ai-report";

describe("dashboard AI summary client fetch", () => {
  it("空响应时不会因为 JSON 解析失败而崩溃", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("")
    });

    const result = await fetchDashboardAiReport(fetchMock as typeof fetch);

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.report).toBeNull();
  });

  it("非 JSON 响应时会降级为暂未生成", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue("<html>429</html>")
    });

    const result = await fetchDashboardAiReport(fetchMock as typeof fetch);

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("暂未生成");
  });
});
