import {
  aiReviewConfig,
  normalizeAiBatchSize,
  normalizeAiSampleLimit
} from "@/config/ai-review";
import {
  type AIReviewProvider,
  type AiRecordReviewResult,
  getAIReviewProvider
} from "@/lib/ai/review-provider";
import { rebuildAnalysisDatasetDerivedState } from "@/lib/services/dataset-analysis-service";
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
const AI_REVIEW_RETRY_DELAY_MS = 5000;
const INTER_RECORD_REVIEW_DELAY_MS = 1500;
const AI_REVIEW_SLOW_THRESHOLD_MS = 2 * 60 * 1000;
const AI_REVIEW_STALL_THRESHOLD_MS = 6 * 60 * 1000;
const GLM_INTER_RECORD_DELAY_MS = 5000;
const GLM_MIN_BATCH_COOLDOWN_MS = 20000;
const GLM_MIN_RATE_LIMIT_COOLDOWN_MS = 60000;

type ReviewMode = "start" | "continue" | "restart" | "retry-failed";
type ReviewAction = ReviewMode | "cancel";

type RunningReviewJob = {
  promise: Promise<void>;
  cancelRequested: boolean;
  currentAbortController: AbortController | null;
  startedAt: string;
  lastAttemptAt: string | null;
  lastProgressAt: string | null;
};

const runningReviewJobs = new Map<string, RunningReviewJob>();

export interface AiReviewCandidate extends RecordListItem {
  candidateReasons: string[];
  candidateScore: number;
  primaryIssueTypes: string[];
}

export interface AiReviewSampleResultItem {
  recordId: string;
  aiReviewed: boolean;
  aiRiskLevel: "low" | "medium" | "high" | null;
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
  const queueSettings = getQueueSettings(provider.name);
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

  const analysisByRecordId = new Map(dataset.analyses.map((item) => [item.recordId, item] as const));
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
        aiRiskLevel: null,
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

  const rebuiltDataset = rebuildAnalysisDatasetDerivedState(
    analysisDatasetSchema.parse({
      ...dataset,
      datasetId: dataset.batch.datasetId,
      batchId: dataset.batch.batchId,
      analyses: updatedAnalyses,
      recordList: updatedRecordList
    })
  );
  const updatedDataset = analysisDatasetSchema.parse({
    ...rebuiltDataset,
    aiReviewProgress: buildAiReviewProgressFromDataset(rebuiltDataset)
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
  mode?: ReviewMode;
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

  const datasetId = loadedDataset.datasetId ?? loadedDataset.batch.datasetId;
  const mode = params?.mode ?? (params?.force ? "restart" : "continue");
  const dataset = prepareDatasetForReviewMode(loadedDataset, mode);
  if (dataset !== loadedDataset) {
    await repositories.analysis.save(dataset);
  }

  const enabled = params?.enabled ?? aiReviewConfig.enabled;
  const allCandidates = selectAllAiReviewCandidates(dataset);
  const unresolvedCandidates = getPendingCandidates(dataset, allCandidates, mode);
  const totalBatches = getTotalBatches(unresolvedCandidates.length);

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
  const queueSettings = getQueueSettings(provider.name);
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
  const runningState = runningReviewJobs.get(datasetId);
  let workingDataset = analysisDatasetSchema.parse({
    ...dataset,
    aiReviewProgress: aiReviewProgressSchema.parse({
      status: unresolvedCandidates.length === 0 ? "completed" : "running",
      totalCandidates: allCandidates.length,
      completedCount: initialProgress.completedCount,
      successCount: initialProgress.successCount,
      failedCount: initialProgress.failedCount,
      pendingCount: unresolvedCandidates.length,
      exportReady: unresolvedCandidates.length === 0,
      startedAt: new Date().toISOString(),
      finishedAt: unresolvedCandidates.length === 0 ? new Date().toISOString() : null,
      lastAttemptAt: initialProgress.lastAttemptAt ?? null,
      lastProgressAt: initialProgress.lastProgressAt ?? null,
      cooldownUntil: null,
      currentBatch: unresolvedCandidates.length === 0 ? 0 : 1,
      totalBatches,
      currentRecordId: null,
      cancelRequested: false,
      message:
        unresolvedCandidates.length === 0
          ? "当前批次的 AI 复核已完成，可导出包含完整 AI 结果的 Excel。"
          : `AI 正在执行完整复核，共 ${totalBatches} 批，请稍候。`
    })
  });

  await repositories.analysis.save(workingDataset);

  const analysisByRecordId = new Map(
    workingDataset.analyses.map((item) => [item.recordId, item] as const)
  );

  const batches = chunkCandidates(
    unresolvedCandidates,
    queueSettings.batchSize
  );

  for (const [batchIndex, batchCandidates] of batches.entries()) {
    if (runningState?.cancelRequested) {
      break;
    }

    workingDataset = analysisDatasetSchema.parse({
      ...workingDataset,
      aiReviewProgress: aiReviewProgressSchema.parse({
        ...workingDataset.aiReviewProgress,
        status: "running",
        currentBatch: batchIndex + 1,
        totalBatches,
        cooldownUntil: null,
        currentRecordId: null,
        cancelRequested: runningState?.cancelRequested ?? false,
        message: `AI 正在执行第 ${batchIndex + 1}/${totalBatches} 批复核，本批 ${batchCandidates.length} 条。`
      })
    });
    await repositories.analysis.save(workingDataset);

    for (const candidate of batchCandidates) {
      if (runningState?.cancelRequested) {
        break;
      }

      const analysis = analysisByRecordId.get(candidate.recordId);
      const reviewedAt = new Date().toISOString();
      const attemptAt = new Date().toISOString();
      if (runningState) {
        runningState.lastAttemptAt = attemptAt;
        runningState.currentAbortController = new AbortController();
      }

      workingDataset = analysisDatasetSchema.parse({
        ...workingDataset,
        aiReviewProgress: aiReviewProgressSchema.parse({
          ...workingDataset.aiReviewProgress,
          status: "running",
          lastAttemptAt: attemptAt,
          cooldownUntil: null,
          currentBatch: batchIndex + 1,
          totalBatches,
          currentRecordId: candidate.recordId,
          cancelRequested: runningState?.cancelRequested ?? false,
          message: `AI 正在执行第 ${batchIndex + 1}/${totalBatches} 批，当前处理第 ${candidate.rowIndex} 行记录。`
        })
      });
      await repositories.analysis.save(workingDataset);

      const review = await reviewCandidateWithRetry(
        provider,
        candidate,
        analysis,
        runningState?.currentAbortController?.signal
      );
      if (runningState) {
        runningState.currentAbortController = null;
        runningState.lastProgressAt = new Date().toISOString();
      }

      workingDataset = applyReviewToDataset(
        workingDataset,
        candidate.recordId,
        review,
        reviewedAt,
        provider.name
      );
      workingDataset = analysisDatasetSchema.parse({
        ...workingDataset,
        aiReviewProgress: calculateRunningProgress(workingDataset, {
          currentBatch: batchIndex + 1,
          totalBatches
        })
      });
      await repositories.analysis.save(workingDataset);

      if (isRateLimitedReviewFailure(review)) {
        workingDataset = await applyCooldownProgress(
          workingDataset,
          queueSettings.rateLimitCooldownMs,
          `检测到模型限流，系统将在 ${Math.round(
            queueSettings.rateLimitCooldownMs / 1000
          )} 秒后继续复核。`,
          {
            currentBatch: batchIndex + 1,
            totalBatches
          }
        );
      }

      await sleep(queueSettings.interRecordDelayMs);
    }

    if (runningState?.cancelRequested) {
      break;
    }

    if (batchIndex < batches.length - 1) {
      workingDataset = await applyCooldownProgress(
        workingDataset,
        queueSettings.batchCooldownMs,
        `第 ${batchIndex + 1}/${totalBatches} 批已完成，系统将短暂冷却后继续下一批。`,
        {
          currentBatch: batchIndex + 1,
          totalBatches
        }
      );
    }
  }

  const progressBase = buildAiReviewProgressFromDataset(workingDataset);
  const wasCancelled = runningState?.cancelRequested === true;
  const finalProgress = aiReviewProgressSchema.parse({
    ...progressBase,
    status: wasCancelled ? "cancelled" : progressBase.exportReady ? "completed" : "failed",
    startedAt: workingDataset.aiReviewProgress?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    lastAttemptAt: workingDataset.aiReviewProgress?.lastAttemptAt ?? null,
    lastProgressAt:
      runningState?.lastProgressAt ?? workingDataset.aiReviewProgress?.lastProgressAt ?? null,
    cooldownUntil: null,
    currentBatch: totalBatches,
    totalBatches,
    currentRecordId: null,
    cancelRequested: false,
    message: wasCancelled
      ? "AI 复核已中断，可选择继续复核、重试失败项或重新复核。"
      : progressBase.exportReady
        ? "AI 完整复核已完成，可以导出包含完整 AI 结果的 Excel。"
        : "仍有部分 AI 复核未完成，请继续复核或重试失败项。"
  });

  workingDataset = analysisDatasetSchema.parse({
    ...workingDataset,
    aiReviewProgress: finalProgress
  });
  await repositories.analysis.save(workingDataset);

  return {
    success: finalProgress.exportReady || finalProgress.status === "cancelled",
    status:
      finalProgress.status === "completed"
        ? ("completed" as const)
        : finalProgress.status === "cancelled"
          ? ("failed" as const)
          : ("failed" as const),
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
  action?: ReviewAction;
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

  const datasetId = loadedDataset.datasetId ?? loadedDataset.batch.datasetId;
  const action = params?.action ?? (params?.force ? "restart" : "continue");
  const runningJob = runningReviewJobs.get(datasetId);
  const existingProgress = normalizeAiReviewProgress(loadedDataset);

  if (action === "cancel") {
    if (!runningJob) {
      return {
        success: true,
        status: existingProgress.status === "running" ? ("failed" as const) : ("completed" as const),
        started: false,
        provider: params?.provider?.name ?? aiReviewConfig.provider,
        message: "当前没有正在运行的 AI 复核任务。",
        progress: existingProgress
      };
    }

    runningJob.cancelRequested = true;
    runningJob.currentAbortController?.abort("cancelled-by-user");

    const progress = aiReviewProgressSchema.parse({
      ...existingProgress,
      status: "running",
      cancelRequested: true,
      message: "已请求中断，系统会在当前调用结束后停止。"
    });
    await repositories.analysis.save(
      analysisDatasetSchema.parse({
        ...loadedDataset,
        aiReviewProgress: progress
      })
    );

    return {
      success: true,
      status: "running" as const,
      started: false,
      provider: params?.provider?.name ?? aiReviewConfig.provider,
      message: progress.message,
      progress
    };
  }

  if (runningJob && isRunningJobStalled(runningJob)) {
    runningJob.cancelRequested = true;
    runningJob.currentAbortController?.abort("restart-from-stalled");
    runningReviewJobs.delete(datasetId);
  }

  if (action === "continue" && existingProgress.pendingCount === 0 && existingProgress.failedCount > 0) {
    return {
      success: true,
      status: "failed" as const,
      started: false,
      provider: params?.provider?.name ?? aiReviewConfig.provider,
      message: "当前没有待继续的记录，可选择重试失败项或重新复核。",
      progress: existingProgress
    };
  }

  if (action === "retry-failed" && existingProgress.failedCount === 0) {
    return {
      success: true,
      status: existingProgress.exportReady ? ("completed" as const) : ("failed" as const),
      started: false,
      provider: params?.provider?.name ?? aiReviewConfig.provider,
      message: "当前没有失败项需要重试。",
      progress: existingProgress
    };
  }

  if (existingProgress.exportReady && !params?.force && action !== "restart") {
    return {
      success: true,
      status: "completed" as const,
      started: false,
      provider: params?.provider?.name ?? aiReviewConfig.provider,
      message: "当前批次的 AI 复核已完成，可导出包含完整 AI 结果的 Excel。",
      progress: existingProgress
    };
  }

  const dataset = prepareDatasetForReviewMode(loadedDataset, action);
  if (dataset !== loadedDataset) {
    await repositories.analysis.save(dataset);
  }

  const currentProgress = normalizeAiReviewProgress(dataset);

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

  const startedAt = new Date().toISOString();
  const jobState: RunningReviewJob = {
    promise: Promise.resolve(),
    cancelRequested: false,
    currentAbortController: null,
    startedAt,
    lastAttemptAt: null,
    lastProgressAt: currentProgress.lastProgressAt ?? null
  };

  const job = (async () => {
    const primaryResult = await reviewAllNeedAiRecords({
      ...params,
      datasetId,
      mode: action
    });

    if (
      primaryResult.failedCount > 0 &&
      !jobState.cancelRequested &&
      action !== "retry-failed"
    ) {
      await sleep(getQueueSettings(params?.provider?.name ?? aiReviewConfig.provider).rateLimitCooldownMs);
      await reviewAllNeedAiRecords({
        ...params,
        datasetId,
        mode: "retry-failed"
      });
    }
  })()
    .catch(async (error) => {
      const latestDataset = await loadAnalysisDataset(datasetId);
      if (!latestDataset) {
        return;
      }

      const failedProgress = aiReviewProgressSchema.parse({
        ...normalizeAiReviewProgress(latestDataset),
        status: "failed",
        exportReady: false,
        finishedAt: new Date().toISOString(),
        lastAttemptAt: jobState.lastAttemptAt,
        lastProgressAt: jobState.lastProgressAt,
        cooldownUntil: null,
        currentRecordId: null,
        cancelRequested: false,
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

  jobState.promise = job.then(() => undefined);
  runningReviewJobs.set(datasetId, jobState);

  return {
    success: true,
    status: "started" as const,
    started: true,
    provider: params?.provider?.name ?? aiReviewConfig.provider,
    message: "AI 完整复核已开始，系统会持续更新进度。",
    progress: {
      ...currentProgress,
      status: "running",
      startedAt,
      currentBatch: currentProgress.totalCandidates > 0 ? 1 : 0,
      totalBatches: getTotalBatches(currentProgress.pendingCount || currentProgress.totalCandidates),
      cooldownUntil: null,
      cancelRequested: false,
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
          aiRiskLevel: null,
          finalRiskLevel: item.ruleRiskLevel ?? item.riskLevel,
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
          aiRiskLevel: null,
          finalRiskLevel: item.ruleRiskLevel ?? item.riskLevel,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null,
          aiReviewReason: null,
          aiReviewedAt: null
        })
      : item
  );

  return rebuildAnalysisDatasetDerivedState(
    analysisDatasetSchema.parse({
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
        lastAttemptAt: null,
        lastProgressAt: null,
        cooldownUntil: null,
        currentBatch: 0,
        totalBatches: 0,
        currentRecordId: null,
        cancelRequested: false,
        message: "已重新开始 AI 复核准备，进度将从 0 开始。"
      })
    })
  );
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
          aiRiskLevel: null,
          finalRiskLevel: item.ruleRiskLevel ?? item.riskLevel,
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
          aiRiskLevel: null,
          finalRiskLevel: item.ruleRiskLevel ?? item.riskLevel,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null,
          aiReviewReason: null,
          aiReviewedAt: null
        })
      : item
  );

  return rebuildAnalysisDatasetDerivedState(
    analysisDatasetSchema.parse({
      ...dataset,
      analyses,
      recordList,
      aiReviewProgress: buildAiReviewProgressFromDataset({
        ...dataset,
        analyses,
        recordList
      } as AnalysisDataset)
    })
  );
}

function clearFailedAiReviewForRetry(dataset: AnalysisDataset) {
  const shouldClear = (item: {
    needAiReview: boolean;
    aiReviewed?: boolean;
    aiReviewReason?: string | null;
  }) => item.needAiReview && item.aiReviewed !== true && Boolean(item.aiReviewReason);

  const hasFailed = dataset.recordList.some(shouldClear) || dataset.analyses.some(shouldClear);
  if (!hasFailed) {
    return dataset;
  }

  const analyses = dataset.analyses.map((item) =>
    shouldClear(item)
      ? recordAnalysisResultSchema.parse({
          ...item,
          aiReviewed: false,
          aiRiskLevel: null,
          finalRiskLevel: item.ruleRiskLevel ?? item.riskLevel,
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
          aiRiskLevel: null,
          finalRiskLevel: item.ruleRiskLevel ?? item.riskLevel,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null,
          aiReviewReason: null,
          aiReviewedAt: null
        })
      : item
  );

  return rebuildAnalysisDatasetDerivedState(
    analysisDatasetSchema.parse({
      ...dataset,
      analyses,
      recordList,
      aiReviewProgress: buildAiReviewProgressFromDataset({
        ...dataset,
        analyses,
        recordList
      } as AnalysisDataset)
    })
  );
}

function prepareDatasetForReviewMode(dataset: AnalysisDataset, mode: ReviewMode) {
  if (mode === "restart") {
    return resetAiReviewForNeedAiRecords(dataset);
  }

  if (mode === "retry-failed") {
    return clearFailedAiReviewForRetry(dataset);
  }

  return clearIncompleteAiReviewForRetry(dataset);
}

function getPendingCandidates(
  dataset: AnalysisDataset,
  allCandidates: AiReviewCandidate[],
  mode: ReviewMode
) {
  if (mode === "retry-failed") {
    return allCandidates.filter(
      (candidate) => candidate.aiReviewed !== true && Boolean(candidate.aiReviewReason)
    );
  }

  return allCandidates.filter(
    (candidate) =>
      !isAiReviewCompleted(candidate) &&
      !(candidate.aiReviewed !== true && Boolean(candidate.aiReviewReason))
  );
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

  const progress = normalizeAiReviewProgress(dataset);

  return {
    success: true,
    progress,
    message: progress.message ?? null
  };
}

function normalizeAiReviewProgress(dataset: AnalysisDataset) {
  const datasetId = dataset.datasetId ?? dataset.batch.datasetId;
  const baseProgress = dataset.aiReviewProgress
    ? aiReviewProgressSchema.parse(dataset.aiReviewProgress)
    : buildAiReviewProgressFromDataset(dataset);
  const runningJob = runningReviewJobs.get(datasetId);

  if (runningJob) {
    const lastAttemptAt = runningJob.lastAttemptAt ?? baseProgress.lastAttemptAt ?? null;
    const lastProgressAt = runningJob.lastProgressAt ?? baseProgress.lastProgressAt ?? null;
    const lastSignalAt =
      lastAttemptAt ?? lastProgressAt ?? baseProgress.startedAt ?? runningJob.startedAt ?? null;
    const elapsedSinceAttempt =
      lastAttemptAt != null ? Date.now() - new Date(lastAttemptAt).getTime() : null;
    const elapsedSinceSignal =
      lastSignalAt != null ? Date.now() - new Date(lastSignalAt).getTime() : null;
    const isSlow =
      elapsedSinceAttempt != null &&
      elapsedSinceAttempt > AI_REVIEW_SLOW_THRESHOLD_MS &&
      elapsedSinceAttempt <= AI_REVIEW_STALL_THRESHOLD_MS;
    const isStalled =
      elapsedSinceSignal != null && elapsedSinceSignal > AI_REVIEW_STALL_THRESHOLD_MS;

    return aiReviewProgressSchema.parse({
      ...baseProgress,
      status: isStalled ? "stalled" : "running",
      startedAt: baseProgress.startedAt ?? runningJob.startedAt,
      lastAttemptAt,
      lastProgressAt,
      cooldownUntil: baseProgress.cooldownUntil ?? null,
      currentBatch: baseProgress.currentBatch ?? 0,
      totalBatches: baseProgress.totalBatches ?? 0,
      cancelRequested: runningJob.cancelRequested,
      currentRecordId: baseProgress.currentRecordId ?? null,
      message: isStalled
        ? "AI 复核长时间没有新进度，可能已停滞。建议继续复核、重试失败项或重新复核。"
        : isSlow
          ? "AI 正在等待模型返回，当前响应较慢，请稍候。"
          : runningJob.cancelRequested
            ? "已请求中断，系统会在当前调用结束后停止。"
            : baseProgress.message ?? "AI 正在后台执行完整复核。"
    });
  }

  if (baseProgress.status === "running") {
    return aiReviewProgressSchema.parse({
      ...baseProgress,
      status: "stalled",
      message: "后台复核任务已中断，当前可继续复核、重试失败项或重新复核。"
    });
  }

  return baseProgress;
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
    lastAttemptAt: dataset.aiReviewProgress?.lastAttemptAt ?? null,
    lastProgressAt: dataset.aiReviewProgress?.lastProgressAt ?? null,
    cooldownUntil: dataset.aiReviewProgress?.cooldownUntil ?? null,
    currentBatch: dataset.aiReviewProgress?.currentBatch ?? 0,
    totalBatches: dataset.aiReviewProgress?.totalBatches ?? getTotalBatches(totalCandidates),
    currentRecordId: dataset.aiReviewProgress?.currentRecordId ?? null,
    cancelRequested: dataset.aiReviewProgress?.cancelRequested ?? false,
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

  const ruleRiskLevel = analysis.ruleRiskLevel ?? analysis.riskLevel;
  const aiRiskLevel = normalizeAiRiskLevelForRecord(analysis, review);
  const finalRiskLevel = aiRiskLevel ?? ruleRiskLevel;

  return recordAnalysisResultSchema.parse({
    ...analysis,
    ruleRiskLevel,
    aiRiskLevel,
    finalRiskLevel,
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

  const ruleRiskLevel = record.ruleRiskLevel ?? record.riskLevel;
  const aiRiskLevel = normalizeAiRiskLevelForRecord(record, review);
  const finalRiskLevel = aiRiskLevel ?? ruleRiskLevel;

  return recordListItemSchema.parse({
    ...record,
    ruleRiskLevel,
    aiRiskLevel,
    finalRiskLevel,
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

  return rebuildAnalysisDatasetDerivedState(
    analysisDatasetSchema.parse({
      ...dataset,
      datasetId: dataset.batch.datasetId,
      batchId: dataset.batch.batchId,
      analyses,
      recordList
    })
  );
}

function buildProviderInput(candidate: AiReviewCandidate, analysis?: RecordAnalysisResult) {
  return {
    recordId: candidate.recordId,
    memberName: candidate.memberName,
    relatedTaskName: candidate.relatedTaskName,
    workContent: candidate.workContent,
    registeredHours: candidate.registeredHours,
    ruleRiskLevel: candidate.ruleRiskLevel ?? candidate.riskLevel,
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
    aiRiskLevel: review.aiRiskLevel ?? null,
    aiSummary: review.aiSummary ?? null,
    aiConfidence: review.aiConfidence ?? null,
    aiReviewLabel: review.aiReviewLabel ?? null,
    aiSuggestion: review.aiSuggestion ?? null,
    aiReviewReason: review.aiReviewReason ?? null
  };
}

function normalizeAiRiskLevelForRecord(
  record:
    | Pick<
        RecordListItem,
        "needAiReview" | "ruleFlags" | "riskLevel" | "ruleRiskLevel" | "workContent" | "relatedTaskName"
      >
    | Pick<
        RecordAnalysisResult,
        "needAiReview" | "ruleFlags" | "riskLevel" | "ruleRiskLevel"
      >,
  review: AiRecordReviewResult
) {
  if (!record.needAiReview || review.aiReviewed !== true) {
    return null;
  }

  const candidate = review.aiRiskLevel;
  if (candidate !== "high" && candidate !== "medium" && candidate !== "low") {
    return null;
  }

  const flags = record.ruleFlags ?? {};
  const hasSemanticSignals =
    flags["task.weak-match"] === true ||
    flags["content.missing-result-signal"] === true ||
    flags["content.generic-process"] === true ||
    flags["content.missing-progress"] === true ||
    flags["content.meeting-too-generic"] === true;

  if (!hasSemanticSignals) {
    return null;
  }

  if (
    candidate === "high" &&
    "workContent" in record &&
    shouldCapHighRiskToMedium(record.workContent, record.relatedTaskName)
  ) {
    return "medium";
  }

  return candidate;
}

async function reviewCandidateWithRetry(
  provider: AIReviewProvider,
  candidate: AiReviewCandidate,
  analysis?: RecordAnalysisResult,
  signal?: AbortSignal
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= AI_REVIEW_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await provider.reviewRecord(buildProviderInput(candidate, analysis), { signal });
    } catch (error) {
      lastError = error;
      if (signal?.aborted) {
        return {
          aiReviewed: false,
          aiRiskLevel: null,
          aiSummary: null,
          aiConfidence: null,
          aiReviewLabel: null,
          aiSuggestion: null,
          aiReviewReason: "AI 复核已手动中断"
        } satisfies AiRecordReviewResult;
      }
      if (attempt < AI_REVIEW_MAX_ATTEMPTS && isRetryableAiError(error)) {
        await sleep(getRetryDelayMs(error, attempt));
        continue;
      }
    }
  }

  return {
    aiReviewed: false,
    aiRiskLevel: null,
    aiSummary: null,
    aiConfidence: null,
    aiReviewLabel: null,
    aiSuggestion: null,
    aiReviewReason: lastError instanceof Error ? lastError.message : "AI 复核调用失败"
  } satisfies AiRecordReviewResult;
}

function calculateRunningProgress(
  dataset: AnalysisDataset,
  batchInfo?: { currentBatch?: number; totalBatches?: number }
) {
  const progress = buildAiReviewProgressFromDataset(dataset);
  const isComplete = progress.exportReady || progress.pendingCount === 0;

  return aiReviewProgressSchema.parse({
    ...progress,
    status: isComplete ? (progress.exportReady ? "completed" : "failed") : "running",
    startedAt: dataset.aiReviewProgress?.startedAt ?? new Date().toISOString(),
    finishedAt: isComplete ? new Date().toISOString() : null,
    cooldownUntil: null,
    currentBatch: batchInfo?.currentBatch ?? dataset.aiReviewProgress?.currentBatch ?? 0,
    totalBatches: batchInfo?.totalBatches ?? dataset.aiReviewProgress?.totalBatches ?? 0,
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
    lastAttemptAt: null,
    lastProgressAt: null,
    cooldownUntil: null,
    currentBatch: 0,
    totalBatches: 0,
    currentRecordId: null,
    cancelRequested: false,
    message: "当前批次没有需要 AI 复核的记录，可直接导出。"
  });
}

async function loadAnalysisDataset(datasetId?: string) {
  return datasetId ? repositories.analysis.get(datasetId) : repositories.analysis.getLatest();
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

function getRetryDelayMs(error: unknown, attempt: number) {
  if (error instanceof Error && /429|rate limit|too many requests/i.test(error.message)) {
    return AI_REVIEW_RETRY_DELAY_MS * (attempt + 1);
  }

  return AI_REVIEW_RETRY_DELAY_MS * attempt;
}

function isRateLimitedReviewFailure(review: AiRecordReviewResult) {
  return (
    review.aiReviewed !== true &&
    typeof review.aiReviewReason === "string" &&
    /429|rate limit|too many requests/i.test(review.aiReviewReason)
  );
}

function getQueueSettings(providerName: string) {
  const batchSize = normalizeAiBatchSize(aiReviewConfig.queue.batchSize);
  const baseSettings = {
    batchSize,
    batchCooldownMs: aiReviewConfig.queue.batchCooldownMs,
    rateLimitCooldownMs: aiReviewConfig.queue.rateLimitCooldownMs,
    interRecordDelayMs: INTER_RECORD_REVIEW_DELAY_MS
  };

  if (providerName === "mock") {
    return {
      batchSize,
      batchCooldownMs: 0,
      rateLimitCooldownMs: 0,
      interRecordDelayMs: 0
    };
  }

  if (providerName !== "glm") {
    return baseSettings;
  }

  return {
    batchSize: 1,
    batchCooldownMs: Math.max(baseSettings.batchCooldownMs, GLM_MIN_BATCH_COOLDOWN_MS),
    rateLimitCooldownMs: Math.max(
      baseSettings.rateLimitCooldownMs,
      GLM_MIN_RATE_LIMIT_COOLDOWN_MS
    ),
    interRecordDelayMs: Math.max(baseSettings.interRecordDelayMs, GLM_INTER_RECORD_DELAY_MS)
  };
}

function isRunningJobStalled(job: Pick<RunningReviewJob, "startedAt" | "lastAttemptAt" | "lastProgressAt">) {
  const heartbeat = job.lastProgressAt ?? job.lastAttemptAt ?? job.startedAt ?? null;
  if (!heartbeat) {
    return false;
  }

  return Date.now() - new Date(heartbeat).getTime() > AI_REVIEW_STALL_THRESHOLD_MS;
}

function shouldCapHighRiskToMedium(workContent: string, taskName?: string) {
  const text = workContent.trim();
  const compactLength = text.replace(/\s+/g, "").length;
  if (compactLength < 20) {
    return false;
  }

  if (isManagementTask(taskName)) {
    return true;
  }

  const hasStructuredClues =
    /完成|输出|提交|确认|解决|修复|联调|测试|开发|优化|排查|实现|进行中|已完成|待验证|方案|接口|模块|系统|需求|页面|弹窗|问题/.test(
      text
    ) || /[，。；、]/.test(text);

  const taskTokens = (taskName ?? "")
    .split(/[\s\-_/：:]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const hasTaskReference = taskTokens.some((token) => text.includes(token));

  return hasStructuredClues || hasTaskReference;
}

function chunkCandidates<T>(items: T[], batchSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    chunks.push(items.slice(index, index + batchSize));
  }
  return chunks;
}

function getTotalBatches(candidateCount: number) {
  if (candidateCount <= 0) {
    return 0;
  }

  return Math.ceil(candidateCount / getQueueSettings(aiReviewConfig.provider).batchSize);
}

async function applyCooldownProgress(
  dataset: AnalysisDataset,
  cooldownMs: number,
  message: string,
  batchInfo: { currentBatch: number; totalBatches: number }
) {
  const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
  const nextDataset = analysisDatasetSchema.parse({
    ...dataset,
    aiReviewProgress: aiReviewProgressSchema.parse({
      ...dataset.aiReviewProgress,
      status: "running",
      cooldownUntil,
      currentBatch: batchInfo.currentBatch,
      totalBatches: batchInfo.totalBatches,
      currentRecordId: null,
      message
    })
  });
  await repositories.analysis.save(nextDataset);
  await sleep(cooldownMs);

  return analysisDatasetSchema.parse({
    ...nextDataset,
    aiReviewProgress: aiReviewProgressSchema.parse({
      ...nextDataset.aiReviewProgress,
      cooldownUntil: null
    })
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
