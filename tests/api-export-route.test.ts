import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureBootstrapped = vi.fn();
const exportLatestAnalysisWorkbook = vi.fn();

vi.mock("@/lib/services/bootstrap", () => ({
  ensureBootstrapped
}));

vi.mock("@/lib/services/export-service-v2", () => ({
  exportLatestAnalysisWorkbook
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

    exportLatestAnalysisWorkbook.mockResolvedValue(
      XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx"
      })
    );
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
    expect(workbook.SheetNames).toEqual(["日报核查明细", "人员汇总"]);
  });
});
