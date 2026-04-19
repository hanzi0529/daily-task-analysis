import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordListItem } from "@/tests/fixtures/report-samples";
import type { AnalysisDataset } from "@/types/domain";

const analysisGetLatest = vi.fn();
const analysisGet = vi.fn();

vi.mock("@/lib/storage/repositories", () => ({
  repositories: {
    analysis: {
      getLatest: analysisGetLatest,
      get: analysisGet,
      setLatest: vi.fn()
    }
  }
}));

describe("record status consistency", () => {
  beforeEach(() => {
    analysisGetLatest.mockReset();
    analysisGet.mockReset();
  });

  it("needAiReview / aiReviewed / hasAiContent 口径清晰且互不混淆", async () => {
    const dataset: AnalysisDataset = {
      datasetId: "dataset_status_test",
      batchId: "batch_status_test",
      batch: {
        batchId: "batch_status_test",
        datasetId: "dataset_status_test",
        status: "analyzed",
        importMode: "upload",
        parserVersion: "v2",
        file: {
          id: "file_test",
          originalFileName: "test.xlsx",
          storedFileName: "test.xlsx",
          storedFilePath: "data/uploads/test.xlsx",
          sizeBytes: 1,
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
      analyses: [],
      recordList: [
        createRecordListItem({
          id: "list_1",
          recordId: "record_1",
          memberName: "张三",
          needAiReview: true,
          aiReviewed: false,
          aiSummary: null,
          aiSuggestion: null
        }),
        createRecordListItem({
          id: "list_2",
          recordId: "record_2",
          memberName: "李四",
          needAiReview: false,
          aiReviewed: true,
          aiSummary: "建议补充结果说明。",
          aiSuggestion: "建议补充当前已完成内容。"
        })
      ],
      dashboard: {
        datasetId: "dataset_status_test",
        batchId: "batch_status_test",
        fileName: "test.xlsx",
        importedAt: "2026-04-14T00:00:00.000Z",
        totalRecords: 2,
        analyzedRecords: 2,
        anomalyRecords: 1,
        abnormalPeopleCount: 1,
        needAiReviewCount: 1,
        duplicateRiskCount: 0,
        dailyHourAnomalyCount: 0,
        totalHours: 16,
        averageHours: 8,
        extra: {}
      },
      people: [],
      batchAiReport: null
    };

    analysisGetLatest.mockResolvedValue(dataset);

    const { getRecordList } = await import("@/lib/services/dataset-analysis-service");
    const records = await getRecordList();

    expect(records[0].needAiReview).toBe(true);
    expect(records[0].aiReviewed).toBe(false);
    expect(records[0].hasAiContent).toBe(false);

    expect(records[1].needAiReview).toBe(false);
    expect(records[1].aiReviewed).toBe(true);
    expect(records[1].hasAiContent).toBe(true);
  });
});
