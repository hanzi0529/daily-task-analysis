import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { exportDetailFields, exportPeopleFields } from "@/config/exportFields";
import { createRecordListItem } from "@/tests/fixtures/report-samples";

const getRecordListV2 = vi.fn();
const getPeopleListV2 = vi.fn();

vi.mock("@/lib/services/query-service-v2", () => ({
  getRecordListV2,
  getPeopleListV2
}));

describe("导出 service", () => {
  beforeEach(() => {
    getRecordListV2.mockResolvedValue([
      {
        ...createRecordListItem({
          memberName: "张三",
          riskLevel: "medium",
          issueCount: 2,
          needAiReview: true,
          ruleFlags: {
            "content.too-short": true,
            "task.weak-match": true
          },
          riskScores: {
            "content.too-short": 0.6,
            "task.weak-match": 0.3
          },
          issueTitles: ["内容过短", "任务匹配较弱"],
          aiReviewed: false,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null
        }),
        primaryIssueTypes: ["内容完整性", "任务匹配"]
      }
    ]);
    getPeopleListV2.mockResolvedValue([
      {
        memberName: "张三",
        account: "zhangsan",
        recordCount: 1,
        totalHours: 7.5,
        anomalyCount: 1,
        needAiReviewCount: 1,
        riskLevel: "medium",
        highlights: ["内容完整性", "任务匹配"]
      }
    ]);
  });

  it("可以导出 xlsx，并且 sheet 与列头和配置一致", async () => {
    const { exportLatestAnalysisWorkbook } = await import(
      "@/lib/services/export-service-v2"
    );
    const buffer = await exportLatestAnalysisWorkbook();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    expect(workbook.SheetNames).toEqual(["日报核查明细", "人员汇总"]);

    const detailHeaders = XLSX.utils.sheet_to_json(workbook.Sheets["日报核查明细"], {
      header: 1
    })[0] as string[];
    const peopleHeaders = XLSX.utils.sheet_to_json(workbook.Sheets["人员汇总"], {
      header: 1
    })[0] as string[];

    expect(detailHeaders).toEqual(exportDetailFields.map((field) => field.title));
    expect(peopleHeaders).toEqual(exportPeopleFields.map((field) => field.title));
    expect(detailHeaders).toContain("AI是否复核");
    expect(detailHeaders).toContain("AI点评");
  });
});
