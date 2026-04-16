import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureBootstrapped = vi.fn();
const prepareLatestAnalysisWorkbook = vi.fn();

vi.mock("@/lib/services/bootstrap", () => ({
  ensureBootstrapped
}));

vi.mock("@/lib/services/export-service-v2", () => ({
  prepareLatestAnalysisWorkbook
}));

describe("GET /api/export/latest", () => {
  beforeEach(() => {
    ensureBootstrapped.mockResolvedValue(undefined);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ 字段: "值" }]),
      "日报核查明细"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ 字段: "值" }]),
      "人员汇总"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ 字段: "值" }]),
      "AI管理总结"
    );

    prepareLatestAnalysisWorkbook.mockResolvedValue({
      ready: true,
      message: null,
      progress: null,
      buffer: XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx"
      })
    });
  });

  it("返回 Excel 文件响应，且 content-type 正确", async () => {
    const { GET } = await import("@/app/api/export/latest/route");
    const response = await GET(new Request("http://localhost/api/export/latest"));
    const buffer = Buffer.from(await response.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(buffer.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(workbook.SheetNames).toEqual(["日报核查明细", "人员汇总", "AI管理总结"]);
  });

  it("AI 复核未完成时也可以导出当前最新 Excel", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ 字段: "当前结果" }]),
      "日报核查明细"
    );
    prepareLatestAnalysisWorkbook.mockResolvedValueOnce({
      ready: true,
      message: null,
      progress: {
        status: "running",
        totalCandidates: 19,
        completedCount: 8,
        successCount: 8,
        failedCount: 0,
        pendingCount: 11,
        exportReady: false,
        startedAt: "2026-04-15T02:00:00.000Z",
        finishedAt: null,
        message: "AI 正在执行完整复核，请稍候。"
      },
      buffer: XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx"
      })
    });

    const { GET } = await import("@/app/api/export/latest/route");
    const response = await GET(new Request("http://localhost/api/export/latest"));
    const buffer = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(buffer.subarray(0, 4).toString("hex")).toBe("504b0304");
  });
});
