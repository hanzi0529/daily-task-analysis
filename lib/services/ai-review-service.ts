import { aiReviewConfig, normalizeAiSampleLimit } from "@/config/ai-review";
import {
  type AIReviewProvider,
  type AiRecordReviewResult,
  getAIReviewProvider
} from "@/lib/ai/review-provider";
import {
  aiReviewProgressSchema,
  analysisDatasetSchema,
  recordAnalysisResultSchema,
  recordListItemSchema
} from "@/lib/schemas/domain";
import { repositories } from "@/lib/storage/repositories";
import type {
  AiReviewProgress,
  AnalysisDataset,
  RecordAnalysisResult,
  RecordListItem
} from "@/types/domain";

const MANAGEMENT_TASK_HINTS = [
  "项目管理",
  "协调推进",
  "会议沟通",
  "跟踪闭环",
  "问题闭环",
  "例会组织",
  "排期推进",
  "需求沟通"
];

const AI_REVIEW_MAX_ATTEMPTS = 3;
const AI_REVIEW_RETRY_DELAY_MS = 1500;
const INTER_RECORD_REVIEW_DELAY_MS = 400;
const runningReviewJobs = new Map<string, Promise<void>>();

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
  aiSuggestion: string | null;
  aiReviewReason: string | null;
}

export async function reviewSampleRecords(params?: {
  datasetId?: string;
  limit?: number;
  provider?: AIReviewProvider;
  enabled?: boolean;
}) {
  const dataset = await loadAnalysisDataset(params?.datasetId);

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
      const review = await provider.reviewRecord(buildProviderInput(candidate, analysis));
      reviewResults.set(candidate.recordId, review);
      items.push(toReviewItem(candidate.recordId, review));
    } catch (error) {
      items.push({
        recordId: candidate.recordId,
        aiReviewed: false,
        aiSummary: null,
        aiConfidence: null,
        aiReviewLabel: null,
        aiSuggestion: null,
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
    recordList: updatedRecordList,
    aiReviewProgress: buildAiReviewProgressFromDataset({
      ...dataset,
      analyses: updatedAnalyses,
      recordList: updatedRecordList
    } as AnalysisDataset)
  });

  await repositories.analysis.save(updatedDataset);

  const reviewedCount = items.filter((item) => item.aiReviewed).length;

  return {
    success: true,
    status: "completed" as const,
    provider: provider.name,
    reviewedCount,
    candidateCount: candidatePool.length,
    items,
    message: `已完成 ${reviewedCount} 条记录的 AI 抽样复核。`
  };
}

export async function reviewAllNeedAiRecords(params?: {
  datasetId?: string;
  provider?: AIReviewProvider;
  enabled?: boolean;
  force?: boolean;
}) {
  const loadedDataset = await loadAnalysisDataset(params?.datasetId);

  if (!loadedDataset) {
    return {
      success: false,
      status: "no-data" as const,
      provider: aiReviewConfig.provider,
      reviewedCount: 0,
      candidateCount: 0,
      failedCount: 0,
      exportReady: false,
      progress: emptyAiReviewProgress(),
      message: "当前没有可供 AI 复核的分析结果。"
    };
  }

  const dataset = params?.force
    ? resetAiReviewForNeedAiRecords(loadedDataset)
    : clearIncompleteAiReviewForRetry(loadedDataset);
  if (params?.force || dataset !== loadedDataset) {
    await repositories.analysis.save(dataset);
  }

  const enabled = params?.enabled ?? aiReviewConfig.enabled;
  const allCandidates = selectAllAiReviewCandidates(dataset);
  const unresolvedCandidates = allCandidates.filter((candidate) => !isAiReviewCompleted(candidate));

  if (!enabled) {
    const progress = aiReviewProgressSchema.parse({
      ...buildAiReviewProgressFromDataset(dataset),
      status: "idle",
      exportReady: allCandidates.length === 0,
      message: "AI 复核当前处于关闭状态。"
    });

    await repositories.analysis.save(
      analysisDatasetSchema.parse({
        ...dataset,
        aiReviewProgress: progress
      })
    );

    return {
      success: true,
      status: "skipped" as const,
      provider: aiReviewConfig.provider,
      reviewedCount: progress.successCount,
      candidateCount: progress.totalCandidates,
      failedCount: progress.failedCount,
      exportReady: progress.exportReady,
      progress,
      message: progress.message
    };
  }

  const provider = params?.provider ?? getAIReviewProvider(aiReviewConfig.provider);
  if (!provider.isAvailable()) {
    const progress = aiReviewProgressSchema.parse({
      ...buildAiReviewProgressFromDataset(dataset),
      status: "failed",
      exportReady: false,
      message: `AI provider ${provider.name} 当前不可用，无法完成完整复核。`
    });

    await repositories.analysis.save(
      analysisDatasetSchema.parse({
        ...dataset,
        aiReviewProgress: progress
      })
    );

    return {
      success: false,
      status: "skipped" as const,
      provider: provider.name,
      reviewedCount: progress.successCount,
      candidateCount: progress.totalCandidates,
      failedCount: progress.failedCount,
      exportReady: progress.exportReady,
      progress,
      message: progress.message
    };
  }

  const initialProgress = buildAiReviewProgressFromDataset(dataset);
  let workingDataset = analysisDatasetSchema.parse({
    ...dataset,
    aiReviewProgress: aiReviewProgressSchema.parse({
      status: unresolvedCandidates.length === 0 ? "completed" : "running",
      totalCandidates: allCandidates.length,
      completedCount: initialProgress.successCount,
      successCount: initialProgress.successCount,
      failedCount: 0,
      pendingCount: unresolvedCandidates.length,
      exportReady: unresolvedCandidates.length === 0,
      startedAt: new Date().toISOString(),
      finishedAt: unresolvedCandidates.length === 0 ? new Date().toISOString() : null,
      message:
        unresolvedCandidates.length === 0
          ? "当前批次的 AI 复核已完成，可导出包含完整 AI 结果的 Excel。"
          : "AI 正在执行完整复核，请稍候。"
    })
  });

  await repositories.analysis.save(workingDataset);

  const analysisByRecordId = new Map(
    workingDataset.analyses.map((item) => [item.recordId, item] as const)
  );

  for (const candidate of unresolvedCandidates) {
    const analysis = analysisByRecordId.get(candidate.recordId);
    const reviewedAt = new Date().toISOString();
    const review = await reviewCandidateWithRetry(provider, candidate, analysis);
    workingDataset = applyReviewToDataset(
      workingDataset,
      candidate.recordId,
      review,
      reviewedAt,
      provider.name
    );
    workingDataset = analysisDatasetSchema.parse({
      ...workingDataset,
      aiReviewProgress: calculateRunningProgress(workingDataset)
    });
    await repositories.analysis.save(workingDataset);
    await sleep(INTER_RECORD_REVIEW_DELAY_MS);
  }

  const progressBase = buildAiReviewProgressFromDataset(workingDataset);
  const finalProgress = aiReviewProgressSchema.parse({
    ...progressBase,
    status: progressBase.exportReady ? "completed" : "failed",
    startedAt: workingDataset.aiReviewProgress?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    message: progressBase.exportReady
      ? "AI 完整复核已完成，可以导出包含完整 AI 结果的 Excel。"
      : "仍有部分 AI 复核未完成，请重试失败项。"
  });

  workingDataset = analysisDatasetSchema.parse({
    ...workingDataset,
    aiReviewProgress: finalProgress
  });
  await repositories.analysis.save(workingDataset);

  return {
    success: finalProgress.exportReady,
    status: finalProgress.exportReady ? ("completed" as const) : ("failed" as const),
    provider: provider.name,
    reviewedCount: finalProgress.successCount,
    candidateCount: finalProgress.totalCandidates,
    failedCount: finalProgress.failedCount,
    exportReady: finalProgress.exportReady,
    progress: finalProgress,
    message: finalProgress.message
  };
}

export async function startAiReviewAllInBackground(params?: {
  datasetId?: string;
  provider?: AIReviewProvider;
  enabled?: boolean;
  force?: boolean;
}) {
  const loadedDataset = await loadAnalysisDataset(params?.datasetId);

  if (!loadedDataset) {
    return {
      success: false,
      status: "no-data" as const,
      started: false,
      provider: aiReviewConfig.provider,
      message: "当前没有可供 AI 复核的分析结果。",
      progress: emptyAiReviewProgress()
    };
  }

  const dataset = params?.force ? resetAiReviewForNeedAiRecords(loadedDataset) : loadedDataset;
  if (params?.force) {
    await repositories.analysis.save(dataset);
  }

  const datasetId = dataset.datasetId ?? dataset.batch.datasetId;
  const currentProgress = dataset.aiReviewProgress
    ? aiReviewProgressSchema.parse(dataset.aiReviewProgress)
    : buildAiReviewProgressFromDataset(dataset);

  if (currentProgress.exportReady && !params?.force) {
    return {
      success: true,
      status: "completed" as const,
      started: false,
      provider: params?.provider?.name ?? aiReviewConfig.provider,
      message: "当前批次的 AI 复核已完成，可导出包含完整 AI 结果的 Excel。",
      progress: currentProgress
    };
  }

  if (runningReviewJobs.has(datasetId)) {
    return {
      success: true,
      status: "running" as const,
      started: false,
      provider: params?.provider?.name ?? aiReviewConfig.provider,
      message: currentProgress.message ?? "AI 正在后台执行完整复核，请稍候。",
      progress: {
        ...currentProgress,
        status: "running"
      }
    };
  }

  const job = reviewAllNeedAiRecords(params)
    .catch(async (error) => {
      const latestDataset = await loadAnalysisDataset(datasetId);
      if (!latestDataset) {
        return;
      }

      const failedProgress = aiReviewProgressSchema.parse({
        ...buildAiReviewProgressFromDataset(latestDataset),
        status: "failed",
        exportReady: false,
        finishedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "AI 完整复核执行失败。"
      });

      await repositories.analysis.save(
        analysisDatasetSchema.parse({
          ...latestDataset,
          aiReviewProgress: failedProgress
        })
      );
    })
    .finally(() => {
      runningReviewJobs.delete(datasetId);
    });

  runningReviewJobs.set(datasetId, job.then(() => undefined));

  return {
    success: true,
    status: "started" as const,
    started: true,
    provider: params?.provider?.name ?? aiReviewConfig.provider,
    message: "AI 完整复核已开始，系统会持续更新进度。",
    progress: {
      ...currentProgress,
      status: "running",
      message: "AI 完整复核已开始，系统会持续更新进度。"
    }
  };
}

function resetAiReviewForNeedAiRecords(dataset: AnalysisDataset) {
  const analyses = dataset.analyses.map((item) =>
    item.needAiReview
      ? recordAnalysisResultSchema.parse({
          ...item,
          aiReviewed: false,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null,
          aiReviewReason: null,
          aiReviewedAt: null
        })
      : item
  );
  const recordList = dataset.recordList.map((item) =>
    item.needAiReview
      ? recordListItemSchema.parse({
          ...item,
          aiReviewed: false,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null,
          aiReviewReason: null,
          aiReviewedAt: null
        })
      : item
  );

  return analysisDatasetSchema.parse({
    ...dataset,
    analyses,
    recordList,
    aiReviewProgress: aiReviewProgressSchema.parse({
      status: "idle",
      totalCandidates: recordList.filter((item) => item.needAiReview).length,
      completedCount: 0,
      successCount: 0,
      failedCount: 0,
      pendingCount: recordList.filter((item) => item.needAiReview).length,
      exportReady: recordList.every((item) => !item.needAiReview),
      startedAt: null,
      finishedAt: null,
      message: "已重新开始 AI 复核准备，进度将从 0 开始。"
    })
  });
}

function clearIncompleteAiReviewForRetry(dataset: AnalysisDataset) {
  const shouldClear = (item: {
    needAiReview: boolean;
    aiReviewed?: boolean;
    aiSummary?: string | null;
    aiReviewLabel?: string | null;
    aiSuggestion?: string | null;
    aiReviewReason?: string | null;
  }) =>
    item.needAiReview &&
    !isAiReviewCompleted({
      aiReviewed: item.aiReviewed ?? false,
      aiSummary: item.aiSummary ?? null,
      aiReviewLabel: item.aiReviewLabel ?? null,
      aiSuggestion: item.aiSuggestion ?? null,
      aiReviewReason: item.aiReviewReason ?? null
    });

  const hasIncomplete = dataset.recordList.some(shouldClear) || dataset.analyses.some(shouldClear);
  if (!hasIncomplete) {
    return dataset;
  }

  const analyses = dataset.analyses.map((item) =>
    shouldClear(item)
      ? recordAnalysisResultSchema.parse({
          ...item,
          aiReviewed: false,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null,
          aiReviewReason: null,
          aiReviewedAt: null
        })
      : item
  );
  const recordList = dataset.recordList.map((item) =>
    shouldClear(item)
      ? recordListItemSchema.parse({
          ...item,
          aiReviewed: false,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null,
          aiReviewReason: null,
          aiReviewedAt: null
        })
      : item
  );

  return analysisDatasetSchema.parse({
    ...dataset,
    analyses,
    recordList,
    aiReviewProgress: buildAiReviewProgressFromDataset({
      ...dataset,
      analyses,
      recordList
    } as AnalysisDataset)
  });
}

export async function getAiReviewProgress(datasetId?: string) {
  const dataset = await loadAnalysisDataset(datasetId);
  if (!dataset) {
    return {
      success: false,
      progress: emptyAiReviewProgress(),
      message: "当前没有可用的分析结果。"
    };
  }

  const progress = dataset.aiReviewProgress
    ? aiReviewProgressSchema.parse(dataset.aiReviewProgress)
    : buildAiReviewProgressFromDataset(dataset);

  return {
    success: true,
    progress,
    message: progress.message ?? null
  };
}

export function selectAiReviewCandidates(dataset: AnalysisDataset, limit?: number) {
  const sampleLimit = normalizeAiSampleLimit(limit);
  return selectAllAiReviewCandidates(dataset).slice(0, sampleLimit);
}

export function buildAiReviewProgressFromDataset(dataset: AnalysisDataset) {
  const totalCandidates = dataset.recordList.filter((item) => item.needAiReview).length;
  const successCount = dataset.recordList.filter(
    (item) => item.needAiReview && isAiReviewCompleted(item)
  ).length;
  const failedCount = dataset.recordList.filter(
    (item) => item.needAiReview && !item.aiReviewed && Boolean(item.aiReviewReason)
  ).length;
  const pendingCount = Math.max(totalCandidates - successCount - failedCount, 0);
  const completedCount = successCount + failedCount;
  const exportReady = totalCandidates === 0 || successCount === totalCandidates;

  return aiReviewProgressSchema.parse({
    status: exportReady
      ? "completed"
      : failedCount > 0
        ? "failed"
        : pendingCount > 0
          ? "idle"
          : "completed",
    totalCandidates,
    completedCount,
    successCount,
    failedCount,
    pendingCount,
    exportReady,
    startedAt: dataset.aiReviewProgress?.startedAt ?? null,
    finishedAt: exportReady ? dataset.aiReviewProgress?.finishedAt ?? null : null,
    message:
      totalCandidates === 0
        ? "当前批次没有需要 AI 复核的记录，可直接导出。"
        : exportReady
          ? "AI 完整复核已完成，可以导出包含完整 AI 结果的 Excel。"
          : failedCount > 0
            ? "存在未完成的 AI 复核记录，请重试。"
            : "尚未开始完整 AI 复核。"
  });
}

export function hasAiContent(
  item:
    | Pick<RecordListItem, "aiSummary" | "aiReviewLabel" | "aiSuggestion" | "aiReviewReason">
    | Pick<
        RecordAnalysisResult,
        "aiSummary" | "aiReviewLabel" | "aiSuggestion" | "aiReviewReason"
      >
) {
  return Boolean(item.aiSummary || item.aiReviewLabel || item.aiSuggestion || item.aiReviewReason);
}

function isAiReviewCompleted(
  item:
    | Pick<RecordListItem, "aiReviewed" | "aiSummary" | "aiReviewLabel" | "aiSuggestion" | "aiReviewReason">
    | Pick<
        RecordAnalysisResult,
        "aiReviewed" | "aiSummary" | "aiReviewLabel" | "aiSuggestion" | "aiReviewReason"
      >
) {
  return item.aiReviewed === true && hasAiContent(item);
}

function selectAllAiReviewCandidates(dataset: AnalysisDataset) {
  return dataset.recordList
    .map((record) => buildCandidate(record))
    .filter((candidate): candidate is AiReviewCandidate => candidate != null)
    .sort((left, right) => {
      if (right.candidateScore !== left.candidateScore) {
        return right.candidateScore - left.candidateScore;
      }

      return left.rowIndex - right.rowIndex;
    });
}

function buildCandidate(record: RecordListItem) {
  if (!record.needAiReview) {
    return null;
  }

  const reasons: string[] = [];
  let score = 6;
  const isManagement = isManagementTask(record.relatedTaskName);
  const isManagementAmbiguous =
    isManagement &&
    (record.ruleFlags["task.weak-match"] === true ||
      record.ruleFlags["content.missing-result-signal"] === true ||
      record.ruleFlags["content.generic-process"] === true ||
      record.ruleFlags["content.meeting-too-generic"] === true ||
      record.ruleFlags["content.missing-progress"] === true);

  if (aiReviewConfig.candidateRules.needAiReview) {
    reasons.push("need-ai-review");
  }

  if (aiReviewConfig.candidateRules.mediumRisk && record.riskLevel === "medium") {
    reasons.push("medium-risk");
    score += 4;
  }

  if (record.riskLevel === "high") {
    reasons.push("semantic-high-risk");
    score += 3;
  }

  if (aiReviewConfig.candidateRules.managementAmbiguous && isManagementAmbiguous) {
    reasons.push("management-ambiguous");
    score += 4;
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
    aiSuggestion: review.aiSuggestion ?? null,
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
    aiSuggestion: review.aiSuggestion ?? null,
    aiReviewReason: review.aiReviewReason ?? null,
    aiReviewedAt: review.aiReviewed ? reviewedAt : record.aiReviewedAt ?? null
  });
}

function applyReviewToDataset(
  dataset: AnalysisDataset,
  recordId: string,
  review: AiRecordReviewResult,
  reviewedAt: string,
  providerName: string
) {
  const analyses = dataset.analyses.map((item) =>
    item.recordId === recordId
      ? attachAiReviewToAnalysis(item, review, reviewedAt, providerName)
      : item
  );
  const recordList = dataset.recordList.map((item) =>
    item.recordId === recordId ? attachAiReviewToRecord(item, review, reviewedAt) : item
  );

  return analysisDatasetSchema.parse({
    ...dataset,
    datasetId: dataset.batch.datasetId,
    batchId: dataset.batch.batchId,
    analyses,
    recordList
  });
}

function buildProviderInput(
  candidate: AiReviewCandidate,
  analysis?: RecordAnalysisResult
) {
  return {
    recordId: candidate.recordId,
    memberName: candidate.memberName,
    relatedTaskName: candidate.relatedTaskName,
    workContent: candidate.workContent,
    registeredHours: candidate.registeredHours,
    riskLevel: candidate.riskLevel,
    ruleSummary: analysis?.summary,
    primaryIssueTypes: candidate.primaryIssueTypes,
    ruleFlags: candidate.ruleFlags,
    isManagementTask: isManagementTask(candidate.relatedTaskName)
  };
}

function toReviewItem(recordId: string, review: AiRecordReviewResult): AiReviewSampleResultItem {
  return {
    recordId,
    aiReviewed: review.aiReviewed,
    aiSummary: review.aiSummary ?? null,
    aiConfidence: review.aiConfidence ?? null,
    aiReviewLabel: review.aiReviewLabel ?? null,
    aiSuggestion: review.aiSuggestion ?? null,
    aiReviewReason: review.aiReviewReason ?? null
  };
}

async function reviewCandidateWithRetry(
  provider: AIReviewProvider,
  candidate: AiReviewCandidate,
  analysis?: RecordAnalysisResult
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= AI_REVIEW_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await provider.reviewRecord(buildProviderInput(candidate, analysis));
    } catch (error) {
      lastError = error;
      if (attempt < AI_REVIEW_MAX_ATTEMPTS && isRetryableAiError(error)) {
        await sleep(AI_REVIEW_RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }

  return {
    aiReviewed: false,
    aiSummary: null,
    aiConfidence: null,
    aiReviewLabel: null,
    aiSuggestion: null,
    aiReviewReason:
      lastError instanceof Error ? lastError.message : "AI 复核调用失败"
  } satisfies AiRecordReviewResult;
}

function calculateRunningProgress(dataset: AnalysisDataset) {
  const progress = buildAiReviewProgressFromDataset(dataset);
  const isComplete = progress.exportReady || progress.pendingCount === 0;

  return aiReviewProgressSchema.parse({
    ...progress,
    status: isComplete ? (progress.exportReady ? "completed" : "failed") : "running",
    startedAt: dataset.aiReviewProgress?.startedAt ?? new Date().toISOString(),
    finishedAt: isComplete ? new Date().toISOString() : null,
    message: isComplete
      ? progress.exportReady
        ? "AI 完整复核已完成，可以导出包含完整 AI 结果的 Excel。"
        : "仍有部分 AI 复核失败，请重试。"
      : `AI 正在完整复核中，已完成 ${progress.completedCount}/${progress.totalCandidates}。`
  });
}

function emptyAiReviewProgress(): AiReviewProgress {
  return aiReviewProgressSchema.parse({
    status: "idle",
    totalCandidates: 0,
    completedCount: 0,
    successCount: 0,
    failedCount: 0,
    pendingCount: 0,
    exportReady: true,
    startedAt: null,
    finishedAt: null,
    message: "当前批次没有需要 AI 复核的记录，可直接导出。"
  });
}

async function loadAnalysisDataset(datasetId?: string) {
  return datasetId
    ? repositories.analysis.get(datasetId)
    : repositories.analysis.getLatest();
}

function isManagementTask(taskName?: string) {
  const value = taskName ?? "";
  return MANAGEMENT_TASK_HINTS.some((keyword) => value.includes(keyword));
}

function isRetryableAiError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /429|rate limit|too many requests|timeout|temporarily unavailable/i.test(
    error.message
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
