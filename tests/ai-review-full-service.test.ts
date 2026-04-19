import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";
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

function createDataset(): AnalysisDataset {
  const recordList = [
    createRecordListItem({
      id: "list_1",
      recordId: "record_1",
      memberName: "张三",
      account: "zhangsan",
      relatedTaskName: "接口联调",
      workContent: "继续推进接口联调并整理问题清单",
      riskLevel: "medium",
      needAiReview: true,
      issueCount: 2,
      issueTitles: ["任务匹配较弱", "结果痕迹较弱"],
      ruleFlags: {
        "task.weak-match": true,
        "content.missing-result-signal": true
      }
    }),
    createRecordListItem({
      id: "list_2",
      recordId: "record_2",
      memberName: "李四",
      account: "lisi",
      relatedTaskName: "项目管理",
      workContent: "协调推进阶段计划并组织会议沟通",
      riskLevel: "high",
      needAiReview: true,
      issueCount: 1,
      issueTitles: ["会议描述泛化"],
      ruleFlags: {
        "content.meeting-too-generic": true,
        "content.generic-process": true
      }
    }),
    createRecordListItem({
      id: "list_3",
      recordId: "record_3",
      memberName: "王五",
      account: "wangwu",
      relatedTaskName: "普通任务",
      workContent: "完成测试",
      riskLevel: "low",
      needAiReview: false,
      issueCount: 0,
      issueTitles: []
    })
  ];

  return {
    datasetId: "dataset_full_review_test",
    batchId: "batch_full_review_test",
    batch: {
      batchId: "batch_full_review_test",
      datasetId: "dataset_full_review_test",
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
        importedAt: "2026-04-15T00:00:00.000Z",
        extra: {}
      },
      sheetName: "日报",
      rawHeaders: [],
      totalRawRecords: 3,
      totalNormalizedRecords: 3,
      importedAt: "2026-04-15T00:00:00.000Z",
      extra: {}
    },
    rawRecords: [],
    normalizedRecords: [],
    analyses: recordList.map((item) => ({
      id: `analysis_${item.recordId}`,
      batchId: "batch_full_review_test",
      recordId: item.recordId,
      memberName: item.memberName,
      workDate: item.workDate,
      relatedTaskName: item.relatedTaskName,
      riskLevel: item.riskLevel,
      issueCount: item.issueCount,
      needAiReview: item.needAiReview,
      ruleFlags: item.ruleFlags,
      riskScores: item.riskScores,
      issues: item.issueTitles.map((title, index) => ({
        ruleKey: `rule_${index + 1}`,
        severity: item.riskLevel === "high" ? "high" : item.riskLevel === "medium" ? "medium" : "low",
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
      datasetId: "dataset_full_review_test",
      batchId: "batch_full_review_test",
      fileName: "test.xlsx",
      importedAt: "2026-04-15T00:00:00.000Z",
      totalRecords: 3,
      analyzedRecords: 3,
      anomalyRecords: 2,
      abnormalPeopleCount: 2,
      needAiReviewCount: 2,
      duplicateRiskCount: 0,
      dailyHourAnomalyCount: 0,
      totalHours: 20,
      averageHours: 6.67,
      extra: {}
    },
    people: [],
    aiReviewProgress: undefined,
    batchAiReport: null
  } as AnalysisDataset;
}

describe("AI 完整复核 service", () => {
  beforeEach(() => {
    analysisGetLatest.mockReset();
    analysisGet.mockReset();
    analysisSave.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("会对所有 needAiReview 记录执行 AI 复核，并更新导出就绪状态", async () => {
    let latestDataset = createDataset();
    analysisGetLatest.mockImplementation(async () => latestDataset);
    analysisGet.mockImplementation(async () => latestDataset);
    analysisSave.mockImplementation(async (value) => {
      latestDataset = value;
    });

    const provider = {
      name: "mock" as const,
      isAvailable: () => true,
      reviewRecord: vi.fn().mockImplementation(async ({ recordId }) => ({
        aiReviewed: true,
        aiSummary: `summary-${recordId}`,
        aiConfidence: 0.88,
        aiReviewLabel: "结果不明确",
        aiSuggestion: "建议补充结果说明。",
        aiReviewReason: "需要补充阶段结果。"
      })),
      reviewBatch: vi.fn().mockRejectedValue(new Error("batch not supported")),
      generateBatchReport: vi.fn()
    };

    const { reviewAllNeedAiRecords, getAiReviewProgress } = await import("@/lib/services/ai-review-service");
    const result = await reviewAllNeedAiRecords({ enabled: true, provider });
    const progress = await getAiReviewProgress();

    expect(result.candidateCount).toBe(2);
    expect(result.reviewedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.exportReady).toBe(true);
    expect(provider.reviewRecord).toHaveBeenCalledTimes(2);
    expect(progress.progress.exportReady).toBe(true);
    expect(progress.progress.successCount).toBe(2);
    expect(analysisSave).toHaveBeenCalled();
  });

  it("停滞后的重新复核会重新启动新任务", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T08:00:00.000Z"));

    let latestDataset = createDataset();
    analysisGetLatest.mockImplementation(async () => latestDataset);
    analysisGet.mockImplementation(async () => latestDataset);
    analysisSave.mockImplementation(async (value) => {
      latestDataset = value;
    });

    const hangingProvider = {
      name: "mock" as const,
      isAvailable: () => true,
      reviewRecord: vi.fn().mockImplementation((_, options?: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted by restart")),
            { once: true }
          );
        });
      }),
      reviewBatch: vi.fn().mockRejectedValue(new Error("batch not supported")),
      generateBatchReport: vi.fn()
    };

    const fastProvider = {
      name: "mock" as const,
      isAvailable: () => true,
      reviewRecord: vi.fn().mockResolvedValue({
        aiReviewed: true,
        aiRiskLevel: "medium",
        aiSummary: "已重新发起复核。",
        aiConfidence: 0.8,
        aiReviewLabel: "任务匹配待确认",
        aiSuggestion: "建议补充结果说明。",
        aiReviewReason: "重新复核后已返回结果。"
      }),
      reviewBatch: vi.fn().mockRejectedValue(new Error("batch not supported")),
      generateBatchReport: vi.fn()
    };

    const { startAiReviewAllInBackground } = await import("@/lib/services/ai-review-service");

    const started = await startAiReviewAllInBackground({
      enabled: true,
      provider: hangingProvider
    });
    expect(started.status).toBe("started");

    await vi.advanceTimersByTimeAsync(7 * 60 * 1000);

    const restarted = await startAiReviewAllInBackground({
      enabled: true,
      provider: fastProvider,
      force: true
    });

    expect(restarted.status).toBe("started");
    expect(restarted.started).toBe(true);
  });
});
