import { aiReportConfig } from "@/config/ai-report";
import { getAIReviewProvider } from "@/lib/ai/review-provider";
import { batchAiReportSchema } from "@/lib/schemas/domain";
import { repositories } from "@/lib/storage/repositories";
import type { AnalysisDataset, BatchAiReport } from "@/types/domain";

export type AiReportFailureReason =
  | "rate_limited"
  | "provider_error"
  | "no_data"
  | "disabled";

export async function generateBatchReport(params?: {
  datasetId?: string;
  enabled?: boolean;
}) {
  const dataset = params?.datasetId
    ? await repositories.analysis.get(params.datasetId)
    : await repositories.analysis.getLatest();

  if (!dataset) {
    return createSkippedBatchReportResult({
      provider: aiReportConfig.provider,
      reason: "no_data",
      message: "AI总结暂时未生成，请稍后重试。",
      report: null,
      status: "no-data"
    });
  }

  const enabled = params?.enabled ?? aiReportConfig.enabled;
  if (!enabled) {
    return createSkippedBatchReportResult({
      provider: aiReportConfig.provider,
      reason: "disabled",
      message: "AI总结暂未启用。",
      report: null
    });
  }

  const provider = getAIReviewProvider(aiReportConfig.provider);
  if (!provider.isAvailable()) {
    return createSkippedBatchReportResult({
      provider: provider.name,
      reason: "provider_error",
      message: "AI总结暂时未生成，请稍后重试。",
      report: dataset.batchAiReport ?? null
    });
  }

  try {
    const input = buildBatchReportInput(dataset);
    const reportPayload = await provider.generateBatchReport(input);
    const report = batchAiReportSchema.parse({
      ...reportPayload,
      generatedAt: new Date().toISOString(),
      extra: {
        provider: provider.name,
        aiInput: {
          metrics: input.metrics,
          aiReviewSummary: {
            reviewedCount: input.aiReviewSummary.reviewedCount,
            labelDistribution: input.aiReviewSummary.labelDistribution
          }
        }
      }
    });

    const updatedDataset = {
      ...dataset,
      batchAiReport: report
    };

    await repositories.analysis.save(updatedDataset);

    return {
      success: true,
      skipped: false,
      reason: null,
      status: "completed" as const,
      provider: provider.name,
      report,
      message: "AI 管理总结已生成。"
    };
  } catch (error) {
    return createSkippedBatchReportResult({
      provider: provider.name,
      reason: isRateLimitedError(error) ? "rate_limited" : "provider_error",
      message: "AI总结暂时未生成，请稍后重试。",
      report: dataset.batchAiReport ?? null
    });
  }
}

export async function getStoredBatchAiReport(datasetId?: string) {
  const dataset = datasetId
    ? await repositories.analysis.get(datasetId)
    : await repositories.analysis.getLatest();

  return dataset?.batchAiReport ?? null;
}

export function buildBatchReportInput(dataset: AnalysisDataset) {
  const totalRecords = dataset.dashboard.totalRecords;
  const anomalyRecords = dataset.recordList.filter(isAnomalyRiskRecord).length;
  const anomalyRate =
    totalRecords > 0 ? Number(((anomalyRecords / totalRecords) * 100).toFixed(1)) : 0;
  const highRiskPeopleCount = new Set(
    dataset.recordList
      .filter((item) => getEffectiveRiskLevel(item) === "high")
      .map((item) => item.memberName)
  ).size;

  const riskLevelDistribution = [
    {
      label: "high",
      value: dataset.recordList.filter((item) => getEffectiveRiskLevel(item) === "high").length
    },
    {
      label: "medium",
      value: dataset.recordList.filter((item) => getEffectiveRiskLevel(item) === "medium").length
    },
    {
      label: "low",
      value: dataset.recordList.filter((item) => getEffectiveRiskLevel(item) === "low").length
    },
    {
      label: "normal",
      value: dataset.recordList.filter((item) => getEffectiveRiskLevel(item) === "normal").length
    }
  ];

  const riskTypeMap = new Map<string, number>();
  const riskRecordIds = new Set(
    dataset.recordList.filter(isAnomalyRiskRecord).map((item) => item.recordId)
  );
  for (const analysis of dataset.analyses) {
    if (!riskRecordIds.has(analysis.recordId)) {
      continue;
    }
    for (const issue of analysis.issues) {
      riskTypeMap.set(issue.title, (riskTypeMap.get(issue.title) ?? 0) + 1);
    }
  }

  const topTasks = buildTopTasks(dataset).slice(0, 10);
  const reviewedItems = dataset.recordList.filter((item) => item.aiReviewed);
  const labelDistributionMap = reviewedItems.reduce<Map<string, number>>((map, item) => {
    const label = item.aiReviewLabel || "未标注";
    map.set(label, (map.get(label) ?? 0) + 1);
    return map;
  }, new Map());

  return {
    metrics: {
      totalRecords,
      anomalyRecords,
      anomalyRate,
      highRiskPeopleCount,
      needAiReviewCount: dataset.dashboard.needAiReviewCount,
      totalHours: dataset.dashboard.totalHours
    },
    riskLevelDistribution,
    riskTypeDistribution: [...riskTypeMap.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 8),
    topPeople: [...dataset.people]
      .sort((left, right) => right.anomalyCount - left.anomalyCount)
      .slice(0, 10)
      .map((item) => ({
        memberName: item.memberName,
        anomalyCount: item.anomalyCount,
        riskLevel: item.riskLevel,
        highlights: item.highlights.slice(0, 3)
      })),
    topTasks,
    aiReviewSummary: {
      reviewedCount: reviewedItems.length,
      labelDistribution: [...labelDistributionMap.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value),
      examples: reviewedItems
        .map((item) =>
          [item.aiSummary, item.aiSuggestion].filter((part): part is string => Boolean(part)).join(" | ")
        )
        .filter((item): item is string => Boolean(item))
        .slice(0, aiReportConfig.exampleLimit)
    }
  };
}

function buildTopTasks(dataset: AnalysisDataset) {
  const map = new Map<string, { taskName: string; riskCount: number; totalCount: number }>();

  for (const item of dataset.recordList) {
    if (!item.relatedTaskName) {
      continue;
    }

    const current = map.get(item.relatedTaskName) ?? {
      taskName: item.relatedTaskName,
      riskCount: 0,
      totalCount: 0
    };

    current.totalCount += 1;
    if (isAnomalyRiskRecord(item)) {
      current.riskCount += 1;
    }
    map.set(item.relatedTaskName, current);
  }

  return [...map.values()]
    .filter((item) => item.riskCount > 0)
    .sort((left, right) => right.riskCount - left.riskCount);
}

function isAnomalyRiskRecord(item: { riskLevel: string }) {
  const riskLevel = getEffectiveRiskLevel(item);
  return riskLevel === "medium" || riskLevel === "high";
}

function getEffectiveRiskLevel(item: {
  riskLevel: string;
  finalRiskLevel?: string | null;
}) {
  return item.finalRiskLevel ?? item.riskLevel;
}

export function emptyBatchAiReport(): BatchAiReport {
  return batchAiReportSchema.parse({
    overview: "",
    majorFindings: [],
    riskInsights: [],
    focusPeopleSuggestions: [],
    focusTaskSuggestions: [],
    managementSuggestions: [],
    reportingSummary: "",
    generatedAt: null,
    extra: {}
  });
}

function createSkippedBatchReportResult(params: {
  provider: string;
  reason: AiReportFailureReason;
  message: string;
  report: BatchAiReport | null;
  status?: "skipped" | "no-data";
}) {
  return {
    success: false,
    skipped: true,
    reason: params.reason,
    status: params.status ?? (params.reason === "no_data" ? "no-data" : "skipped"),
    provider: params.provider,
    report: params.report,
    message: params.message
  };
}

function isRateLimitedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /429|rate limit|too many requests/i.test(error.message);
}
