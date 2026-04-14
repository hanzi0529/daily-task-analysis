import { aiReviewConfig, normalizeAiSampleLimit } from "@/config/ai-review";
import {
  type AIReviewProvider,
  type AiRecordReviewResult,
  getAIReviewProvider
} from "@/lib/ai/review-provider";
import {
  analysisDatasetSchema,
  recordAnalysisResultSchema,
  recordListItemSchema
} from "@/lib/schemas/domain";
import { repositories } from "@/lib/storage/repositories";
import type { AnalysisDataset, RecordAnalysisResult, RecordListItem } from "@/types/domain";

const MANAGEMENT_TASK_HINTS = ["项目管理", "协调推进", "会议沟通", "跟踪闭环"];

export interface AiReviewCandidate extends RecordListItem {
  candidateReasons: string[];
  candidateScore: number;
  primaryIssueTypes: string[];
}

export interface AiReviewSampleResultItem {
  recordId: string;
  aiReviewed: boolean;
  aiSummary: string | null;
  aiConfidence: number | null;
  aiReviewLabel: string | null;
  aiReviewReason: string | null;
}

export async function reviewSampleRecords(params?: {
  datasetId?: string;
  limit?: number;
  provider?: AIReviewProvider;
  enabled?: boolean;
}) {
  const dataset = params?.datasetId
    ? await repositories.analysis.get(params.datasetId)
    : await repositories.analysis.getLatest();

  if (!dataset) {
    return {
      success: false,
      status: "no-data" as const,
      provider: aiReviewConfig.provider,
      reviewedCount: 0,
      candidateCount: 0,
      items: [] as AiReviewSampleResultItem[],
      message: "当前没有可供 AI 复核的分析结果。"
    };
  }

  const candidatePool = selectAiReviewCandidates(dataset, params?.limit);
  const enabled = params?.enabled ?? aiReviewConfig.enabled;

  if (!enabled) {
    return {
      success: true,
      status: "skipped" as const,
      provider: aiReviewConfig.provider,
      reviewedCount: 0,
      candidateCount: candidatePool.length,
      items: [] as AiReviewSampleResultItem[],
      message: "AI 抽样复核当前处于关闭状态。"
    };
  }

  const provider = params?.provider ?? getAIReviewProvider(aiReviewConfig.provider);
  if (!provider.isAvailable()) {
    return {
      success: true,
      status: "skipped" as const,
      provider: provider.name,
      reviewedCount: 0,
      candidateCount: candidatePool.length,
      items: [] as AiReviewSampleResultItem[],
      message: `AI provider ${provider.name} 当前未配置，已跳过抽样复核。`
    };
  }

  const analysisByRecordId = new Map(dataset.analyses.map((item) => [item.recordId, item]));
  const reviewTimestamp = new Date().toISOString();
  const reviewResults = new Map<string, AiRecordReviewResult>();
  const items: AiReviewSampleResultItem[] = [];

  for (const candidate of candidatePool) {
    const analysis = analysisByRecordId.get(candidate.recordId);

    try {
      const review = await provider.reviewRecord({
        recordId: candidate.recordId,
        memberName: candidate.memberName,
        relatedTaskName: candidate.relatedTaskName,
        workContent: candidate.workContent,
        registeredHours: candidate.registeredHours,
        ruleSummary: analysis?.summary,
        primaryIssueTypes: candidate.primaryIssueTypes,
        isManagementTask: isManagementTask(candidate.relatedTaskName)
      });

      reviewResults.set(candidate.recordId, review);
      items.push({
        recordId: candidate.recordId,
        aiReviewed: review.aiReviewed,
        aiSummary: review.aiSummary ?? null,
        aiConfidence: review.aiConfidence ?? null,
        aiReviewLabel: review.aiReviewLabel ?? null,
        aiReviewReason: review.aiReviewReason ?? null
      });
    } catch (error) {
      items.push({
        recordId: candidate.recordId,
        aiReviewed: false,
        aiSummary: null,
        aiConfidence: null,
        aiReviewLabel: null,
        aiReviewReason: error instanceof Error ? error.message : "AI 复核调用失败"
      });
    }
  }

  const updatedAnalyses = dataset.analyses.map((item) =>
    attachAiReviewToAnalysis(item, reviewResults.get(item.recordId), reviewTimestamp, provider.name)
  );
  const updatedRecordList = dataset.recordList.map((item) =>
    attachAiReviewToRecord(item, reviewResults.get(item.recordId), reviewTimestamp)
  );

  const updatedDataset = analysisDatasetSchema.parse({
    ...dataset,
    datasetId: dataset.batch.datasetId,
    batchId: dataset.batch.batchId,
    analyses: updatedAnalyses,
    recordList: updatedRecordList
  });

  await repositories.analysis.save(updatedDataset);

  return {
    success: true,
    status: "completed" as const,
    provider: provider.name,
    reviewedCount: items.filter((item) => item.aiReviewed).length,
    candidateCount: candidatePool.length,
    items,
    message: `已完成 ${items.filter((item) => item.aiReviewed).length} 条记录的 AI 抽样复核。`
  };
}

export function selectAiReviewCandidates(dataset: AnalysisDataset, limit?: number) {
  const sampleLimit = normalizeAiSampleLimit(limit);
  const topPeople = new Set(
    [...dataset.people]
      .filter((item) => item.anomalyCount > 0 || item.needAiReviewCount > 0)
      .slice(0, 5)
      .map((item) => item.memberName)
  );

  const taskRiskCount = dataset.recordList.reduce<Map<string, number>>((map, item) => {
    if (!item.relatedTaskName) {
      return map;
    }

    if (item.riskLevel !== "low" || item.needAiReview) {
      map.set(item.relatedTaskName, (map.get(item.relatedTaskName) ?? 0) + 1);
    }

    return map;
  }, new Map());

  const topTasks = new Set(
    [...taskRiskCount.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([taskName]) => taskName)
  );

  const candidates = dataset.recordList
    .map((record) => buildCandidate(record, topPeople, topTasks))
    .filter((candidate): candidate is AiReviewCandidate => candidate != null)
    .sort((left, right) => {
      if (right.candidateScore !== left.candidateScore) {
        return right.candidateScore - left.candidateScore;
      }

      return left.rowIndex - right.rowIndex;
    });

  return candidates.slice(0, sampleLimit);
}

function buildCandidate(
  record: RecordListItem,
  topPeople: Set<string>,
  topTasks: Set<string>
) {
  const reasons: string[] = [];
  let score = 0;
  const isManagement = isManagementTask(record.relatedTaskName);
  const isAmbiguousManagement =
    isManagement &&
    (record.ruleFlags["task.weak-match"] === true ||
      record.issueTitles.some((title) => /短|弱|模糊/.test(title)) ||
      record.issueCount > 0);

  if (aiReviewConfig.candidateRules.needAiReview && record.needAiReview) {
    reasons.push("need-ai-review");
    score += 6;
  }

  if (aiReviewConfig.candidateRules.mediumRisk && record.riskLevel === "medium") {
    reasons.push("medium-risk");
    score += 4;
  }

  if (aiReviewConfig.candidateRules.managementAmbiguous && isAmbiguousManagement) {
    reasons.push("management-ambiguous");
    score += 4;
  }

  if (aiReviewConfig.candidateRules.focusSamples && topPeople.has(record.memberName)) {
    reasons.push("focus-person");
    score += 2;
  }

  if (
    aiReviewConfig.candidateRules.focusSamples &&
    record.relatedTaskName &&
    topTasks.has(record.relatedTaskName)
  ) {
    reasons.push("focus-task");
    score += 2;
  }

  if (reasons.length === 0) {
    return null;
  }

  return {
    ...record,
    primaryIssueTypes: record.issueTitles.slice(0, 3),
    candidateReasons: reasons,
    candidateScore: score + Math.min(record.issueCount, 3)
  } satisfies AiReviewCandidate;
}

function attachAiReviewToAnalysis(
  analysis: RecordAnalysisResult,
  review: AiRecordReviewResult | undefined,
  reviewedAt: string,
  providerName: string
) {
  if (!review) {
    return recordAnalysisResultSchema.parse(analysis);
  }

  return recordAnalysisResultSchema.parse({
    ...analysis,
    aiReviewed: review.aiReviewed,
    aiSummary: review.aiSummary ?? null,
    aiConfidence: review.aiConfidence ?? null,
    aiReviewLabel: review.aiReviewLabel ?? null,
    aiReviewReason: review.aiReviewReason ?? null,
    aiReviewedAt: review.aiReviewed ? reviewedAt : analysis.aiReviewedAt ?? null,
    extra: {
      ...(analysis.extra ?? {}),
      aiProvider: providerName
    }
  });
}

function attachAiReviewToRecord(
  record: RecordListItem,
  review: AiRecordReviewResult | undefined,
  reviewedAt: string
) {
  if (!review) {
    return recordListItemSchema.parse(record);
  }

  return recordListItemSchema.parse({
    ...record,
    aiReviewed: review.aiReviewed,
    aiSummary: review.aiSummary ?? null,
    aiConfidence: review.aiConfidence ?? null,
    aiReviewLabel: review.aiReviewLabel ?? null,
    aiReviewReason: review.aiReviewReason ?? null,
    aiReviewedAt: review.aiReviewed ? reviewedAt : record.aiReviewedAt ?? null
  });
}

function isManagementTask(taskName?: string) {
  return MANAGEMENT_TASK_HINTS.some((keyword) => (taskName ?? "").includes(keyword));
}
