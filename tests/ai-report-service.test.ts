import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalysisDataset } from "@/types/domain";
import { createRecordListItem } from "@/tests/fixtures/report-samples";

const analysisGetLatest = vi.fn();
const analysisGet = vi.fn();
const analysisSave = vi.fn();
const providerGenerateBatchReport = vi.fn();
const providerReviewRecord = vi.fn();

vi.mock("@/lib/storage/repositories", () => ({
  repositories: {
    analysis: {
      getLatest: analysisGetLatest,
      get: analysisGet,
      save: analysisSave,
      setLatest: vi.fn()
    }
  }
}));

vi.mock("@/lib/ai/review-provider", () => ({
  getAIReviewProvider: () => ({
    name: "mock",
    isAvailable: () => true,
    reviewRecord: providerReviewRecord,
    generateBatchReport: providerGenerateBatchReport
  })
}));

function createDataset(): AnalysisDataset {
  const recordList = [
    createRecordListItem({
      id: "list_1",
      recordId: "record_1",
      memberName: "张三",
      account: "zhangsan",
      relatedTaskName: "接口联调",
      riskLevel: "medium",
      issueCount: 2,
      needAiReview: true,
      issueTitles: ["内容过短", "任务匹配较弱"],
      aiReviewed: true,
      aiSummary: "这条日报与任务相关，但结果表达还有补充空间。",
      aiConfidence: 0.76,
      aiReviewLabel: "结果不明确",
      aiSuggestion: "建议补充本次联调形成的问题清单或处理结论。",
      aiReviewReason: "结果痕迹较弱"
    }),
    createRecordListItem({
      id: "list_2",
      recordId: "record_2",
      memberName: "李四",
      account: "lisi",
      relatedTaskName: "项目管理",
      riskLevel: "high",
      issueCount: 1,
      needAiReview: true,
      issueTitles: ["任务匹配较弱"],
      aiReviewed: true,
      aiSummary: "这条记录偏过程化，建议补充会议结论或阶段性输出。",
      aiConfidence: 0.72,
      aiReviewLabel: "会议描述泛化",
      aiSuggestion: "建议说明本次沟通形成的结论、分工或下一步动作。",
      aiReviewReason: "更像协调推进过程"
    })
  ];

  return {
    datasetId: "dataset_report_test",
    batchId: "batch_report_test",
    batch: {
      batchId: "batch_report_test",
      datasetId: "dataset_report_test",
      status: "analyzed",
      importMode: "upload",
      parserVersion: "v2",
      file: {
        id: "file_test",
        originalFileName: "test.xlsx",
        storedFileName: "test.xlsx",
        storedFilePath: "data/uploads/test.xlsx",
        sizeBytes: 128,
        sourceType: "upload",
        importedAt: "2026-04-14T00:00:00.000Z",
        extra: {}
      },
      sheetName: "日报",
      rawHeaders: [],
      totalRawRecords: 2,
      totalNormalizedRecords: 2,
      importedAt: "2026-04-14T00:00:00.000Z",
      extra: {}
    },
    rawRecords: [],
    normalizedRecords: [],
    analyses: [
      {
        id: "analysis_record_1",
        batchId: "batch_report_test",
        recordId: "record_1",
        memberName: "张三",
        workDate: "2026-04-14",
        relatedTaskName: "接口联调",
        riskLevel: "medium",
        issueCount: 2,
        needAiReview: true,
        ruleFlags: { "content.too-short": true },
        riskScores: { "content.too-short": 0.4 },
        issues: [
          {
            ruleKey: "content.too-short",
            severity: "medium",
            title: "内容过短",
            message: "内容过短",
            extra: {}
          }
        ],
        summary: "内容过短",
        aiReviewed: true,
        aiSummary: "这条日报与任务相关，但结果表达还有补充空间。",
        aiConfidence: 0.76,
        aiReviewLabel: "结果不明确",
        aiSuggestion: "建议补充本次联调形成的问题清单或处理结论。",
        aiReviewReason: "结果痕迹较弱",
        aiReviewedAt: "2026-04-14T01:00:00.000Z",
        extra: {}
      },
      {
        id: "analysis_record_2",
        batchId: "batch_report_test",
        recordId: "record_2",
        memberName: "李四",
        workDate: "2026-04-14",
        relatedTaskName: "项目管理",
        riskLevel: "high",
        issueCount: 1,
        needAiReview: true,
        ruleFlags: { "task.weak-match": true },
        riskScores: { "task.weak-match": 0.3 },
        issues: [
          {
            ruleKey: "task.weak-match",
            severity: "low",
            title: "任务匹配较弱",
            message: "任务匹配较弱",
            extra: {}
          }
        ],
        summary: "任务匹配较弱",
        aiReviewed: true,
        aiSummary: "这条记录偏过程化，建议补充会议结论或阶段性输出。",
        aiConfidence: 0.72,
        aiReviewLabel: "会议描述泛化",
        aiSuggestion: "建议说明本次沟通形成的结论、分工或下一步动作。",
        aiReviewReason: "更像协调推进过程",
        aiReviewedAt: "2026-04-14T01:00:00.000Z",
        extra: {}
      }
    ],
    recordList,
    dashboard: {
      datasetId: "dataset_report_test",
      batchId: "batch_report_test",
      fileName: "test.xlsx",
      importedAt: "2026-04-14T00:00:00.000Z",
      totalRecords: 2,
      analyzedRecords: 2,
      anomalyRecords: 2,
      abnormalPeopleCount: 2,
      needAiReviewCount: 2,
      duplicateRiskCount: 0,
      dailyHourAnomalyCount: 0,
      totalHours: 15,
      averageHours: 7.5,
      extra: {}
    },
    people: [
      {
        memberName: "张三",
        account: "zhangsan",
        recordCount: 1,
        totalHours: 7.5,
        anomalyCount: 1,
        needAiReviewCount: 1,
        riskLevel: "medium",
        highlights: ["内容过短"]
      },
      {
        memberName: "李四",
        account: "lisi",
        recordCount: 1,
        totalHours: 7.5,
        anomalyCount: 1,
        needAiReviewCount: 1,
        riskLevel: "high",
        highlights: ["任务匹配较弱"]
      }
    ],
    batchAiReport: null
  } as AnalysisDataset;
}

describe("AI batch report service", () => {
  beforeEach(() => {
    analysisGetLatest.mockReset();
    analysisGet.mockReset();
    analysisSave.mockReset();
    providerGenerateBatchReport.mockReset();
    providerReviewRecord.mockReset();
  });

  it("可以基于结构化输入生成 batchAiReport", async () => {
    analysisGetLatest.mockResolvedValue(createDataset());
    analysisSave.mockResolvedValue(undefined);
    providerGenerateBatchReport.mockResolvedValue({
      overview: "整体风险可控，但存在局部集中异常。",
      majorFindings: ["高风险主要集中在少数人员。"],
      riskInsights: ["内容过短和任务匹配较弱较突出。"],
      focusPeopleSuggestions: ["建议优先关注李四。"],
      focusTaskSuggestions: ["建议关注接口联调。"],
      managementSuggestions: ["建议抽样复核重点任务。"],
      reportingSummary: "建议聚焦重点人员和重点任务。"
    });

    const { generateBatchReport } = await import("@/lib/services/ai-report-service");
    const result = await generateBatchReport({ enabled: true });

    expect(result.success).toBe(true);
    expect(result.report?.overview).toBe("整体风险可控，但存在局部集中异常。");
    expect(providerGenerateBatchReport).toHaveBeenCalledTimes(1);
    expect(analysisSave).toHaveBeenCalledTimes(1);
  });

  it("无数据时不会崩溃", async () => {
    analysisGetLatest.mockResolvedValue(null);

    const { generateBatchReport } = await import("@/lib/services/ai-report-service");
    const result = await generateBatchReport({ enabled: true });

    expect(result.success).toBe(false);
    expect(result.report).toBeNull();
  });

  it("dashboard 聚合数据为空时也能降级生成空结构报告", async () => {
    const dataset = createDataset();
    dataset.recordList = [];
    dataset.analyses = [];
    dataset.people = [];
    dataset.dashboard = {
      ...dataset.dashboard,
      totalRecords: 0,
      analyzedRecords: 0,
      anomalyRecords: 0,
      abnormalPeopleCount: 0,
      needAiReviewCount: 0,
      totalHours: 0,
      averageHours: 0
    };

    analysisGetLatest.mockResolvedValue(dataset);
    analysisSave.mockResolvedValue(undefined);
    providerGenerateBatchReport.mockResolvedValue({
      overview: "",
      majorFindings: [],
      riskInsights: [],
      focusPeopleSuggestions: [],
      focusTaskSuggestions: [],
      managementSuggestions: [],
      reportingSummary: ""
    });

    const { generateBatchReport } = await import("@/lib/services/ai-report-service");
    const result = await generateBatchReport({ enabled: true });

    expect(result.success).toBe(true);
    expect(result.report?.majorFindings).toEqual([]);
    expect(result.report?.managementSuggestions).toEqual([]);
  });

  it("AI 总结不会直接修改规则结果字段", async () => {
    const dataset = createDataset();
    const originalRiskLevels = dataset.recordList.map((item) => item.riskLevel);
    const originalRuleFlags = dataset.analyses.map((item) => item.ruleFlags);

    analysisGetLatest.mockResolvedValue(dataset);
    analysisSave.mockResolvedValue(undefined);
    providerGenerateBatchReport.mockResolvedValue({
      overview: "整体风险可控。",
      majorFindings: ["高风险主要集中在少数人员。"],
      riskInsights: ["任务匹配较弱较集中。"],
      focusPeopleSuggestions: ["建议优先关注张三。"],
      focusTaskSuggestions: ["建议关注接口联调。"],
      managementSuggestions: ["建议抽样复核重点任务。"],
      reportingSummary: "建议管理层聚焦重点样本。"
    });

    const { generateBatchReport } = await import("@/lib/services/ai-report-service");
    await generateBatchReport({ enabled: true });

    const savedDataset = analysisSave.mock.calls[0][0] as AnalysisDataset;
    expect(savedDataset.recordList.map((item) => item.riskLevel)).toEqual(originalRiskLevels);
    expect(savedDataset.analyses.map((item) => item.ruleFlags)).toEqual(originalRuleFlags);
  });
});

