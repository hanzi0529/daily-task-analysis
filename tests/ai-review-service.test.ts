import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalysisDataset } from "@/types/domain";
import { createRecordListItem } from "@/tests/fixtures/report-samples";

const analysisGetLatest = vi.fn();
const analysisGet = vi.fn();
const analysisSave = vi.fn();

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

function createAnalysisDataset(recordCount = 3): AnalysisDataset {
  const recordList = Array.from({ length: recordCount }, (_, index) =>
    createRecordListItem({
      id: `list_${index + 1}`,
      recordId: `record_${index + 1}`,
      rowIndex: index + 2,
      memberName: index < 2 ? "张三" : `成员${index + 1}`,
      account: `user${index + 1}`,
      relatedTaskName: index === 2 ? "项目管理" : "接口联调",
      workContent:
        index === 2 ? "协调推进项目计划并同步进展" : "完成接口联调并输出问题清单",
      riskLevel: index === 1 ? "medium" : "low",
      needAiReview: index !== 0,
      issueCount: index === 0 ? 0 : 1,
      issueTitles: index === 2 ? ["任务匹配较弱"] : index === 1 ? ["内容过短"] : [],
      ruleFlags:
        index === 2
          ? { "task.weak-match": true, "content.generic-process": true }
          : index === 1
            ? { "content.too-short": true }
            : {}
    })
  );

  return {
    datasetId: "dataset_ai_test",
    batchId: "batch_ai_test",
    batch: {
      batchId: "batch_ai_test",
      datasetId: "dataset_ai_test",
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
      totalRawRecords: recordCount,
      totalNormalizedRecords: recordCount,
      importedAt: "2026-04-14T00:00:00.000Z",
      extra: {}
    },
    rawRecords: [],
    normalizedRecords: [],
    analyses: recordList.map((item) => ({
      id: `analysis_${item.recordId}`,
      batchId: "batch_ai_test",
      recordId: item.recordId,
      memberName: item.memberName,
      workDate: item.workDate,
      relatedTaskName: item.relatedTaskName,
      riskLevel: item.riskLevel,
      issueCount: item.issueCount,
      needAiReview: item.needAiReview,
      ruleFlags: item.ruleFlags,
      riskScores: item.riskScores,
      issues: item.issueTitles.map((title, issueIndex) => ({
        ruleKey: `rule_${issueIndex + 1}`,
        severity: item.riskLevel === "low" ? "low" : "medium",
        title,
        message: title,
        extra: {}
      })),
      summary: item.issueTitles.join("；"),
      aiReviewed: false,
      aiSummary: null,
      aiConfidence: null,
      aiReviewLabel: null,
      aiSuggestion: null,
      aiReviewReason: null,
      aiReviewedAt: null,
      extra: {}
    })),
    recordList,
    dashboard: {
      datasetId: "dataset_ai_test",
      batchId: "batch_ai_test",
      fileName: "test.xlsx",
      importedAt: "2026-04-14T00:00:00.000Z",
      totalRecords: recordCount,
      analyzedRecords: recordCount,
      anomalyRecords: 2,
      abnormalPeopleCount: 1,
      needAiReviewCount: 2,
      duplicateRiskCount: 0,
      dailyHourAnomalyCount: 0,
      totalHours: 24,
      averageHours: 8,
      extra: {}
    },
    people: [
      {
        memberName: "张三",
        account: "user1",
        recordCount: 2,
        totalHours: 16,
        anomalyCount: 1,
        needAiReviewCount: 1,
        riskLevel: "medium",
        highlights: ["内容过短"]
      }
    ]
  } as AnalysisDataset;
}

describe("AI 抽样复核 service", () => {
  beforeEach(() => {
    analysisGetLatest.mockReset();
    analysisGet.mockReset();
    analysisSave.mockReset();
  });

  it("会按候选条件筛出 needAiReview / medium / 管理模糊样本", async () => {
    const { selectAiReviewCandidates } = await import("@/lib/services/ai-review-service");
    const dataset = createAnalysisDataset(3);
    const candidates = selectAiReviewCandidates(dataset, 10);

    expect(candidates.map((item) => item.recordId)).toEqual(["record_2", "record_3"]);
    expect(candidates[0].candidateReasons).toContain("need-ai-review");
    expect(candidates[1].candidateReasons).toContain("management-ambiguous");
  });

  it("默认最多只取前 20 条候选记录", async () => {
    const { selectAiReviewCandidates } = await import("@/lib/services/ai-review-service");
    const dataset = createAnalysisDataset(25);
    dataset.recordList = dataset.recordList.map((item, index) => ({
      ...item,
      memberName: `成员${index + 1}`,
      recordId: `record_${index + 1}`,
      id: `list_${index + 1}`,
      needAiReview: true,
      issueCount: 1,
      issueTitles: ["任务匹配较弱"]
    }));
    dataset.analyses = dataset.recordList.map((item) => ({
      id: `analysis_${item.recordId}`,
      batchId: "batch_ai_test",
      recordId: item.recordId,
      memberName: item.memberName,
      workDate: item.workDate,
      relatedTaskName: item.relatedTaskName,
      riskLevel: item.riskLevel,
      issueCount: item.issueCount,
      needAiReview: true,
      ruleFlags: item.ruleFlags,
      riskScores: item.riskScores,
      issues: [],
      summary: "",
      aiReviewed: false,
      aiSummary: null,
      aiConfidence: null,
      aiReviewLabel: null,
      aiSuggestion: null,
      aiReviewReason: null,
      aiReviewedAt: null,
      extra: {}
    }));

    const candidates = selectAiReviewCandidates(dataset);
    expect(candidates).toHaveLength(20);
  });

  it("mock provider 返回稳定结构", async () => {
    const { getAIReviewProvider } = await import("@/lib/ai/review-provider");
    const provider = getAIReviewProvider("mock");
    const review = await provider.reviewRecord({
      recordId: "record_1",
      memberName: "张三",
      relatedTaskName: "接口联调",
      workContent: "完成接口联调并输出问题清单",
      registeredHours: 7.5,
      ruleRiskLevel: "medium",
      ruleSummary: "任务匹配较弱",
      primaryIssueTypes: ["任务匹配"],
      ruleFlags: {
        "task.weak-match": true,
        "content.generic-process": true
      },
      isManagementTask: false
    });

    expect(review.aiReviewed).toBe(true);
    expect(["high", "medium", "low"]).toContain(review.aiRiskLevel);
    expect(typeof review.aiSummary).toBe("string");
    expect(typeof review.aiConfidence).toBe("number");
    expect(review.aiReviewLabel).toBeTruthy();
    expect(typeof review.aiSuggestion).toBe("string");
  });

  it("AI 调用失败时不影响主流程", async () => {
    const { reviewSampleRecords } = await import("@/lib/services/ai-review-service");
    analysisGetLatest.mockResolvedValue(createAnalysisDataset(3));
    analysisSave.mockResolvedValue(undefined);

    const failingProvider = {
      name: "mock" as const,
      isAvailable: () => true,
      reviewRecord: vi.fn().mockRejectedValue(new Error("provider failed")),
      reviewBatch: vi.fn().mockRejectedValue(new Error("batch not supported")),
      generateBatchReport: vi.fn()
    };

    const result = await reviewSampleRecords({
      enabled: true,
      provider: failingProvider
    });

    expect(result.success).toBe(true);
    expect(result.reviewedCount).toBe(0);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].aiReviewed).toBe(false);
    expect(result.items[0].aiSuggestion).toBeNull();
    expect(analysisSave).toHaveBeenCalledTimes(1);
  });

  it("needAiReview 样本在 AI 成功返回后会生成 finalRiskLevel", async () => {
    const { reviewSampleRecords } = await import("@/lib/services/ai-review-service");
    analysisGetLatest.mockResolvedValue(createAnalysisDataset(3));
    analysisSave.mockResolvedValue(undefined);

    const provider = {
      name: "mock" as const,
      isAvailable: () => true,
      reviewRecord: vi.fn().mockResolvedValue({
        aiReviewed: true,
        aiRiskLevel: "high",
        aiSummary: "任务与日报语义关联不足，建议补充具体对象。",
        aiConfidence: 0.88,
        aiReviewLabel: "任务匹配待确认",
        aiSuggestion: "建议补充具体处理对象和阶段结果。",
        aiReviewReason: "当前表达缺少任务对象和结果支撑。"
      }),
      reviewBatch: vi.fn().mockRejectedValue(new Error("batch not supported")),
      generateBatchReport: vi.fn()
    };

    const result = await reviewSampleRecords({
      enabled: true,
      provider
    });

    expect(result.success).toBe(true);
    const savedDataset = analysisSave.mock.calls.at(-1)?.[0] as AnalysisDataset;
    const reviewedRecord = savedDataset.recordList.find((item) => item.recordId === "record_3");
    expect(reviewedRecord?.aiRiskLevel).toBe("high");
    expect(reviewedRecord?.finalRiskLevel).toBe("high");
  });

  it("长文本且已有具体线索时，AI high 会被收敛为 medium", async () => {
    const { reviewSampleRecords } = await import("@/lib/services/ai-review-service");
    const dataset = createAnalysisDataset(3);
    dataset.recordList[1] = {
      ...dataset.recordList[1],
      needAiReview: true,
      workContent: "继续推进接口联调问题修复，完成参数校验调整并同步联调结果",
      relatedTaskName: "接口联调问题修复",
      ruleFlags: {
        "task.weak-match": true,
        "content.missing-result-signal": true
      },
      issueTitles: ["任务匹配较弱", "结果痕迹较弱"],
      riskLevel: "medium",
      ruleRiskLevel: "medium",
      finalRiskLevel: "medium"
    };
    dataset.analyses[1] = {
      ...dataset.analyses[1],
      needAiReview: true,
      relatedTaskName: "接口联调问题修复",
      ruleFlags: {
        "task.weak-match": true,
        "content.missing-result-signal": true
      },
      riskLevel: "medium",
      ruleRiskLevel: "medium",
      finalRiskLevel: "medium"
    };
    analysisGetLatest.mockResolvedValue(dataset);
    analysisSave.mockResolvedValue(undefined);

    const provider = {
      name: "mock" as const,
      isAvailable: () => true,
      reviewRecord: vi.fn().mockResolvedValue({
        aiReviewed: true,
        aiRiskLevel: "high",
        aiSummary: "任务推进证据仍需补充。",
        aiConfidence: 0.86,
        aiReviewLabel: "任务匹配待确认",
        aiSuggestion: "建议补充本次处理对象和联调结论。",
        aiReviewReason: "语义仍有边界，但已有较多具体线索。"
      }),
      reviewBatch: vi.fn().mockRejectedValue(new Error("batch not supported")),
      generateBatchReport: vi.fn()
    };

    await reviewSampleRecords({
      enabled: true,
      provider,
      limit: 2
    });

    const savedDataset = analysisSave.mock.calls.at(-1)?.[0] as AnalysisDataset;
    const reviewedRecord = savedDataset.recordList.find(
      (item) => item.recordId === dataset.recordList[1].recordId
    );
    expect(reviewedRecord?.aiRiskLevel).toBe("medium");
    expect(reviewedRecord?.finalRiskLevel).toBe("medium");
  });
});

