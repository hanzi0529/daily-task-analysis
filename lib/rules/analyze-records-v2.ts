import dayjs from "dayjs";

import { normalizeText, simpleSimilarity } from "@/lib/rules/helpers";
import type { NormalizedRecord, RecordAnalysisResult } from "@/types/domain";

const MANAGEMENT_TASK_HINTS = ["项目管理", "协调推进", "会议沟通", "跟踪闭环"];
const ACTION_ONLY_HINTS = ["沟通", "跟进", "对齐", "讨论", "整理", "推进", "同步", "评审", "排查"];
const RESULT_HINTS = ["完成", "已完成", "产出", "输出", "提交", "解决", "修复", "确认", "闭环", "通过"];

export function analyzeRecordsV2(records: NormalizedRecord[]) {
  const resultMap = new Map<string, RecordAnalysisResult>();
  const dailyHoursByPerson = new Map<string, number>();
  const duplicatePairs = new Set<string>();

  for (const record of records) {
    resultMap.set(record.id, createBaseResult(record));
    const personDateKey = buildPersonDateKey(record);
    dailyHoursByPerson.set(
      personDateKey,
      (dailyHoursByPerson.get(personDateKey) ?? 0) + (record.registeredHours ?? 0)
    );
  }

  for (const record of records) {
    const result = resultMap.get(record.id);
    if (!result) {
      continue;
    }

    applySingleHourRules(record, result);
    applyCompletenessRules(record, result);
    applyTaskWeakMatchRule(record, result);
    applyDailyHourRules(record, result, dailyHoursByPerson);
  }

  for (let index = 0; index < records.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < records.length; nextIndex += 1) {
      const left = records[index];
      const right = records[nextIndex];

      if (buildPersonDateKey(left) !== buildPersonDateKey(right)) {
        continue;
      }

      const pairKey = [left.id, right.id].sort().join("|");
      if (duplicatePairs.has(pairKey)) {
        continue;
      }

      const similarity = simpleSimilarity(left.workContent, right.workContent);
      if (similarity < 0.9) {
        continue;
      }

      duplicatePairs.add(pairKey);
      for (const target of [left, right]) {
        const result = resultMap.get(target.id);
        if (!result) {
          continue;
        }

        applyIssue(result, {
          ruleKey: "content.duplicate-risk",
          severity: "medium",
          title: "同日多条描述高度相似",
          message: "同一成员同一天多条日报内容高度相似，建议复核是否重复填报",
          extra: {
            similarity,
            relatedRecordIds: [left.id, right.id]
          }
        });
        result.ruleFlags["content.duplicate-risk"] = true;
        result.riskScores["content.duplicate-risk"] = normalizeScore(similarity);
      }
    }
  }

  return [...resultMap.values()].map(finalizeResult);
}

function createBaseResult(record: NormalizedRecord): RecordAnalysisResult {
  return {
    id: `analysis_${record.id}`,
    batchId: record.batchId,
    recordId: record.id,
    memberName: record.memberName,
    workDate: record.workDate,
    relatedTaskName: record.relatedTaskName,
    riskLevel: "low",
    issueCount: 0,
    needAiReview: false,
    ruleFlags: {},
    riskScores: {},
    issues: [],
    summary: "",
    aiReviewed: false,
    aiSummary: null,
    aiConfidence: null,
    aiReviewLabel: null,
    aiReviewReason: null,
    aiReviewedAt: null,
    extra: {
      aiProvider: undefined
    }
  };
}

function applySingleHourRules(record: NormalizedRecord, result: RecordAnalysisResult) {
  if (record.registeredHours == null) {
    return;
  }

  if (record.registeredHours > 14) {
    applyIssue(result, {
      ruleKey: "hours.single.high",
      severity: "high",
      title: "单条工时偏高",
      message: `单条工时 ${record.registeredHours}h，超过高工时阈值`,
      extra: {}
    });
    result.ruleFlags["hours.single.high"] = true;
    result.riskScores["hours.single.high"] = normalizeScore(record.registeredHours / 14);
  } else if (record.registeredHours > 12) {
    applyIssue(result, {
      ruleKey: "hours.single.high",
      severity: "medium",
      title: "单条工时偏高",
      message: `单条工时 ${record.registeredHours}h，建议复核是否存在合并填报`,
      extra: {}
    });
    result.ruleFlags["hours.single.high"] = true;
    result.riskScores["hours.single.high"] = normalizeScore(record.registeredHours / 12);
  }

  if (record.registeredHours < 0.25) {
    applyIssue(result, {
      ruleKey: "hours.single.low",
      severity: "medium",
      title: "单条工时偏低",
      message: `单条工时 ${record.registeredHours}h，建议复核拆分合理性`,
      extra: {}
    });
    result.ruleFlags["hours.single.low"] = true;
    result.riskScores["hours.single.low"] = normalizeScore(1 - record.registeredHours / 0.25);
  }
}

function applyDailyHourRules(
  record: NormalizedRecord,
  result: RecordAnalysisResult,
  dailyHoursByPerson: Map<string, number>
) {
  const totalHours = dailyHoursByPerson.get(buildPersonDateKey(record)) ?? 0;

  if (totalHours > 14) {
    applyIssue(result, {
      ruleKey: "hours.daily.high",
      severity: "high",
      title: "单日总工时偏高",
      message: `${record.memberName} 在 ${dayjs(record.workDate).format("YYYY-MM-DD")} 的总工时为 ${totalHours}h`,
      extra: {}
    });
    result.ruleFlags["hours.daily.high"] = true;
    result.riskScores["hours.daily.high"] = normalizeScore(totalHours / 14);
  } else if (totalHours > 12.5) {
    applyIssue(result, {
      ruleKey: "hours.daily.high",
      severity: "medium",
      title: "单日总工时偏高",
      message: `${record.memberName} 在 ${dayjs(record.workDate).format("YYYY-MM-DD")} 的总工时为 ${totalHours}h`,
      extra: {}
    });
    result.ruleFlags["hours.daily.high"] = true;
    result.riskScores["hours.daily.high"] = normalizeScore(totalHours / 12.5);
  }
}

function applyCompletenessRules(record: NormalizedRecord, result: RecordAnalysisResult) {
  const text = normalizeText(record.workContent);
  const isManagementLike = isLowNoiseTask(record.relatedTaskName);

  if (text.length > 0 && text.length < 6) {
    applyIssue(result, {
      ruleKey: "content.too-short",
      severity: "medium",
      title: "内容过短",
      message: "日报内容过短，信息量不足，建议补充具体事项或结果",
      extra: {}
    });
    result.ruleFlags["content.too-short"] = true;
    result.riskScores["content.too-short"] = normalizeScore(1 - text.length / 6);
  } else if (text.length >= 6 && text.length < 12 && !isManagementLike) {
    applyIssue(result, {
      ruleKey: "content.too-short",
      severity: "low",
      title: "内容较短",
      message: "日报描述偏短，建议补充结果、对象或动作细节",
      extra: {}
    });
    result.ruleFlags["content.too-short"] = true;
    result.riskScores["content.too-short"] = normalizeScore(1 - text.length / 12);
  }

  if (
    text.length > 0 &&
    !hasResultSignal(text) &&
    containsActionOnlySignal(text) &&
    !isManagementLike &&
    text.length < 80
  ) {
    applyIssue(result, {
      ruleKey: "content.missing-result-signal",
      severity: "low",
      title: "结果痕迹较弱",
      message: "内容以动作描述为主，建议补充结果、输出或进展结论",
      extra: {}
    });
    result.ruleFlags["content.missing-result-signal"] = true;
    result.riskScores["content.missing-result-signal"] = 0.2;
  }
}

function applyTaskWeakMatchRule(record: NormalizedRecord, result: RecordAnalysisResult) {
  if (!record.relatedTaskName || !record.workContent) {
    return;
  }

  const isManagementLike = isLowNoiseTask(record.relatedTaskName);
  if (isManagementLike) {
    return;
  }

  const content = normalizeText(record.workContent);
  const taskTokens = normalizeText(record.relatedTaskName)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  if (taskTokens.length === 0) {
    return;
  }

  const matchedCount = taskTokens.filter((token) => content.includes(token)).length;
  const matchRatio = matchedCount / taskTokens.length;
  const similarity = simpleSimilarity(record.relatedTaskName, record.workContent);

  if (matchRatio >= 0.2 || similarity >= 0.24 || content.length >= 100) {
    return;
  }

  applyIssue(result, {
    ruleKey: "task.weak-match",
    severity: "low",
    title: "任务匹配较弱",
    message: "工作内容与任务名称的直接匹配较弱，建议作为 AI 复核候选",
    extra: {
      matchRatio,
      similarity
    }
  });
  result.ruleFlags["task.weak-match"] = true;
  result.ruleFlags["needAiReview"] = true;
  result.riskScores["task.weak-match"] = normalizeScore((1 - Math.max(matchRatio, similarity)) * 0.6);
  result.needAiReview = true;
}

function applyIssue(
  result: RecordAnalysisResult,
  issue: RecordAnalysisResult["issues"][number]
) {
  if (result.issues.some((current) => current.ruleKey === issue.ruleKey)) {
    return;
  }

  result.issues.push(issue);
}

function finalizeResult(result: RecordAnalysisResult) {
  result.issueCount = result.issues.length;
  const highCount = result.issues.filter((issue) => issue.severity === "high").length;
  const mediumCount = result.issues.filter((issue) => issue.severity === "medium").length;

  result.riskLevel =
    highCount > 0
      ? "high"
      : mediumCount >= 2 || (mediumCount >= 1 && result.issues.length >= 2)
        ? "medium"
        : "low";

  result.summary =
    result.issues.length > 0
      ? result.issues.map((issue) => issue.title).join("；")
      : "未发现明显异常";

  return result;
}

function buildPersonDateKey(record: NormalizedRecord) {
  return `${record.account || record.memberName}__${record.workDate}`;
}

function isLowNoiseTask(taskName?: string) {
  return MANAGEMENT_TASK_HINTS.some((keyword) => (taskName || "").includes(keyword));
}

function hasResultSignal(text: string) {
  return RESULT_HINTS.some((keyword) => text.includes(keyword)) || /已完成\d+%/.test(text);
}

function containsActionOnlySignal(text: string) {
  return ACTION_ONLY_HINTS.some((keyword) => text.includes(keyword));
}

function normalizeScore(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}
