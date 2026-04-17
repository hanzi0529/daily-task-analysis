import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { exportDetailFields, exportPeopleFields } from "@/config/exportFields";
import { createRecordListItem } from "@/tests/fixtures/report-samples";

const getRecordListV2 = vi.fn();
const getPeopleListV2 = vi.fn();
const getStoredBatchAiReport = vi.fn();

vi.mock("@/lib/services/query-service-v2", () => ({
  getRecordListV2,
  getPeopleListV2
}));

vi.mock("@/lib/services/ai-report-service", () => ({
  getStoredBatchAiReport
}));

describe("导出 service", () => {
  beforeEach(() => {
    getRecordListV2.mockResolvedValue([
      {
        ...createRecordListItem({
          memberName: "张三",
          riskLevel: "medium",
          ruleRiskLevel: "medium",
          aiRiskLevel: "high",
          finalRiskLevel: "high",
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
          aiReviewed: true,
          aiSummary: "这条日报与任务相关，但结果表达还有补充空间。",
          aiConfidence: 0.83,
          aiReviewLabel: "结果不明确",
          aiSuggestion: "建议补充当前已完成的具体结果或后续动作。"
        }),
        primaryIssueTypes: ["内容完整性", "任务匹配"],
        hasAiContent: true
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
    getStoredBatchAiReport.mockResolvedValue({
      overview: "整体风险可控。",
      majorFindings: ["高风险主要集中在少数人员。"],
      managementSuggestions: ["建议抽样复核重点任务。"],
      reportingSummary: "建议管理层聚焦重点样本。"
    });
  });

  it("可以导出 xlsx，并且 sheet 与列头和配置一致", async () => {
    const { exportLatestAnalysisWorkbook } = await import(
      "@/lib/services/export-service-v2"
    );
    const buffer = await exportLatestAnalysisWorkbook();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    expect(workbook.SheetNames).toEqual(["日报核查明细", "人员汇总", "AI管理总结"]);

    const detailRows = XLSX.utils.sheet_to_json(workbook.Sheets["日报核查明细"], {
      header: 1
    }) as string[][];
    const detailHeaders = detailRows[0];
    const firstDataRow = detailRows[1];
    const peopleHeaders = XLSX.utils.sheet_to_json(workbook.Sheets["人员汇总"], {
      header: 1
    })[0] as string[];

    expect(detailHeaders).toEqual(exportDetailFields.map((field) => field.title));
    expect(peopleHeaders).toEqual(exportPeopleFields.map((field) => field.title));
    expect(detailHeaders).toContain("规则风险等级");
    expect(detailHeaders).toContain("AI复核风险等级");
    expect(detailHeaders).toContain("AI是否已复核");
    expect(detailHeaders).toContain("AI复核结果");
    expect(detailHeaders).not.toContain("AI是否有内容");
    expect(detailHeaders).not.toContain("AI置信度");
    expect(detailHeaders).not.toContain("规则标记");
    expect(detailHeaders).not.toContain("风险分值");
    expect(detailHeaders).not.toContain("原始字段JSON");
    expect(workbook.Sheets["AI管理总结"]).toBeTruthy();
    expect(firstDataRow).toContain("是");
    expect(firstDataRow.join("\n")).toContain("分析：这条日报与任务相关，但结果表达还有补充空间。");
    expect(firstDataRow.join("\n")).toContain("建议：建议补充当前已完成的具体结果或后续动作。");
  });

  it("导出中的 needAiReview 列映射到规则层字段", async () => {
    const { exportLatestAnalysisWorkbook } = await import(
      "@/lib/services/export-service-v2"
    );
    const buffer = await exportLatestAnalysisWorkbook();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const detailRows = XLSX.utils.sheet_to_json(workbook.Sheets["日报核查明细"], {
      header: 1
    }) as string[][];

    const detailHeaders = detailRows[0];
    const firstRow = detailRows[1];
    const needAiReviewIndex = detailHeaders.indexOf("需AI复核");
    const aiReviewedIndex = detailHeaders.indexOf("AI是否已复核");
    const riskLevelIndex = detailHeaders.indexOf("风险等级");
    const ruleRiskLevelIndex = detailHeaders.indexOf("规则风险等级");
    const aiRiskLevelIndex = detailHeaders.indexOf("AI复核风险等级");

    expect(firstRow[needAiReviewIndex]).toBe("是");
    expect(firstRow[aiReviewedIndex]).toBe("是");
    expect(firstRow[riskLevelIndex]).toBe("高风险");
    expect(firstRow[ruleRiskLevelIndex]).toBe("中风险");
    expect(firstRow[aiRiskLevelIndex]).toBe("高风险");
  });

  it("即使 AI 总结为空，也不会影响导出", async () => {
    getStoredBatchAiReport.mockResolvedValueOnce(null);
    getRecordListV2.mockResolvedValueOnce([
      {
        ...createRecordListItem({
          memberName: "李四",
          needAiReview: false,
          aiReviewed: false,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null
        }),
        primaryIssueTypes: [],
        hasAiContent: false
      }
    ]);

    const { exportLatestAnalysisWorkbook } = await import(
      "@/lib/services/export-service-v2"
    );
    const buffer = await exportLatestAnalysisWorkbook();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    expect(workbook.SheetNames).toContain("AI管理总结");
    const detailHeaders = XLSX.utils.sheet_to_json(workbook.Sheets["日报核查明细"], {
      header: 1
    })[0] as string[];
    expect(detailHeaders).toContain("AI复核结果");
    expect(detailHeaders).toContain("需AI复核");
  });
});
