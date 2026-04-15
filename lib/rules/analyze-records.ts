import dayjs from "dayjs";

import { ruleThresholds } from "@/config/app";
import { normalizeText, simpleSimilarity } from "@/lib/rules/helpers";
import type { NormalizedRecord, RecordAnalysisResult } from "@/types/domain";

export function analyzeRecords(records: NormalizedRecord[]) {
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

    const totalHours = dailyHoursByPerson.get(buildPersonDateKey(record)) ?? 0;
    if (totalHours > ruleThresholds.maxDailyHours) {
      applyIssue(result, {
        ruleKey: "hours.daily.high",
        severity: "high",
        title: "单日总工时偏高",
        message: `${record.memberName} 在 ${dayjs(record.workDate).format("YYYY-MM-DD")} 的总工时为 ${totalHours}h`,
        extra: {}
      });
      result.ruleFlags["hours.daily.high"] = true;
      result.riskScores["hours.daily.high"] = normalizeScore(
        totalHours / ruleThresholds.maxDailyHours
      );
    } else if (totalHours > 0 && totalHours < ruleThresholds.minDailyHours) {
      applyIssue(result, {
        ruleKey: "hours.daily.low",
        severity: "medium",
        title: "单日总工时偏低",
        message: `${record.memberName} 在 ${dayjs(record.workDate).format("YYYY-MM-DD")} 的总工时为 ${totalHours}h`,
        extra: {}
      });
      result.ruleFlags["hours.daily.low"] = true;
      result.riskScores["hours.daily.low"] = normalizeScore(
        1 - totalHours / ruleThresholds.minDailyHours
      );
    }
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
      if (similarity < ruleThresholds.duplicateSimilarityThreshold) {
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
    aiSuggestion: null,
    aiReviewReason: null,
    aiReviewedAt: null,
    extra: {}
  };
}

function applySingleHourRules(
  record: NormalizedRecord,
  result: RecordAnalysisResult
) {
  if (record.registeredHours == null) {
    return;
  }

  if (record.registeredHours > ruleThresholds.maxSingleRecordHours) {
    applyIssue(result, {
      ruleKey: "hours.single.high",
      severity: "high",
      title: "单条工时偏高",
      message: `单条工时 ${record.registeredHours}h，超过阈值`,
      extra: {}
    });
    result.ruleFlags["hours.single.high"] = true;
    result.riskScores["hours.single.high"] = normalizeScore(
      record.registeredHours / ruleThresholds.maxSingleRecordHours
    );
  }

  if (record.registeredHours < ruleThresholds.minSingleRecordHours) {
    applyIssue(result, {
      ruleKey: "hours.single.low",
      severity: "medium",
      title: "单条工时偏低",
      message: `单条工时 ${record.registeredHours}h，建议复核拆分合理性`,
      extra: {}
    });
    result.ruleFlags["hours.single.low"] = true;
    result.riskScores["hours.single.low"] = normalizeScore(
      1 - record.registeredHours / ruleThresholds.minSingleRecordHours
    );
  }
}

function applyCompletenessRules(
  record: NormalizedRecord,
  result: RecordAnalysisResult
) {
  const text = normalizeText(record.workContent);

  if (text.length < ruleThresholds.minContentLength) {
    applyIssue(result, {
      ruleKey: "content.too-short",
      severity: "medium",
      title: "内容过短",
      message: "日报内容长度不足，可能缺少有效信息",
      extra: {}
    });
    result.ruleFlags["content.too-short"] = true;
    result.riskScores["content.too-short"] = normalizeScore(
      1 - text.length / Math.max(ruleThresholds.minContentLength, 1)
    );
  }

  if (text && !hasResultSignal(text)) {
    applyIssue(result, {
      ruleKey: "content.missing-result-signal",
      severity: "low",
      title: "缺少结果痕迹",
      message: "内容更像动作描述，建议补充结果、输出或结论",
      extra: {}
    });
    result.ruleFlags["content.missing-result-signal"] = true;
    result.riskScores["content.missing-result-signal"] = 0.35;
  }
}

function applyTaskWeakMatchRule(
  record: NormalizedRecord,
  result: RecordAnalysisResult
) {
  if (!record.relatedTaskName) {
    return;
  }

  const content = normalizeText(record.workContent);
  const tokens = normalizeText(record.relatedTaskName)
    .split(" ")
    .filter(Boolean);
  if (tokens.length === 0) {
    return;
  }

  const matchedCount = tokens.filter((token) => content.includes(token)).length;
  const matchRatio = matchedCount / tokens.length;
  if (matchRatio >= 0.3) {
    return;
  }

  applyIssue(result, {
    ruleKey: "task.weak-match",
    severity: "low",
    title: "任务匹配较弱",
    message: "工作内容与任务名称关键词关联度较低，建议复核",
    extra: {}
  });
  result.ruleFlags["task.weak-match"] = true;
  result.ruleFlags["needAiReview"] = true;
  result.riskScores["task.weak-match"] = normalizeScore(1 - matchRatio);
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
  result.riskLevel = result.issues.some((issue) => issue.severity === "high")
    ? "high"
    : result.issues.some((issue) => issue.severity === "medium")
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

function hasResultSignal(text: string) {
  return /(完成|输出|产出|解决|修复|提交|上线|关闭|交付|确认|结论|结果|已实现)/.test(
    text
  );
}

function normalizeScore(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}
