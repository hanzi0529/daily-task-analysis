import dayjs from "dayjs";

import { normalizeText, simpleSimilarity } from "@/lib/rules/helpers";
import type { NormalizedRecord, RecordAnalysisResult } from "@/types/domain";

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
const ACTION_ONLY_HINTS = ["沟通", "跟进", "对齐", "讨论", "整理", "推进", "同步", "评审", "排查"];
const RESULT_HINTS = ["完成", "已完成", "产出", "输出", "提交", "解决", "修复", "确认", "闭环", "通过"];
const DETAIL_HINTS = ["设计", "开发", "测试", "联调", "排查", "验证", "整理", "编写", "分析", "配置", "迁移", "实现", "优化", "评审"];
const GENERIC_PROCESS_HINTS = ["参加", "沟通", "讨论", "跟进", "协调", "推进", "开会"];
const CONCLUSION_HINTS = ["明确", "决定", "确认方案", "达成一致", "结论", "下一步", "分工", "方案"];
const STATUS_HINTS = ["进行中", "已完成", "待验证", "待提交", "联调中", "测试中"];
const MEETING_HINTS = ["参加会议", "参与讨论", "参与沟通", "会议交流", "参与沟通会", "沟通会"];
const MEETING_OUTCOME_HINTS = ["结论", "下一步", "方案", "分工", "达成一致", "确认方案"];
const MIN_AI_REVIEW_TEXT_LENGTH = 12;
const MISSING_RESULT_LONG_TEXT_LENGTH = 45;
const CORE_FIELD_KEYS = ["workContent", "registeredHours"] as const;
const SEMANTIC_REVIEW_RULE_KEYS = [
  "task.weak-match",
  "content.missing-result-signal"
] as const;

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

    applyCoreFieldRules(record, result);
    applyCompletenessRules(record, result);
    applyTaskWeakMatchRule(record, result);
    applyDailyHourRules(record, result, dailyHoursByPerson);
    applyExpressionQualityHints(record, result);
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
          message: "同一成员同一天多条日报内容高度相似，建议优先按重复填报风险处理。",
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

  return records.map((record) => {
    const result = resultMap.get(record.id);
    if (!result) {
      throw new Error(`Missing analysis result for record ${record.id}`);
    }

    return finalizeResult(record, result);
  });
}

function createBaseResult(record: NormalizedRecord): RecordAnalysisResult {
  return {
    id: `analysis_${record.id}`,
    batchId: record.batchId,
    recordId: record.id,
    memberName: record.memberName,
    workDate: record.workDate,
    relatedTaskName: record.relatedTaskName,
    riskLevel: "normal",
    ruleRiskLevel: "normal",
    aiRiskLevel: null,
    finalRiskLevel: "normal",
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
    extra: {
      aiProvider: undefined
    }
  };
}

function applyCoreFieldRules(record: NormalizedRecord, result: RecordAnalysisResult) {
  const missingFields = CORE_FIELD_KEYS.filter((fieldKey) => {
    const value = record[fieldKey];
    if (fieldKey === "registeredHours") {
      return typeof value !== "number" || value <= 0;
    }
    if (typeof value !== "string") {
      return !value;
    }
    return value.trim().length === 0;
  });

  if (missingFields.length === 0) {
    return;
  }

  applyIssue(result, {
    ruleKey: "fields.missing-core",
    severity: "high",
    title: buildMissingCoreTitle(missingFields),
    message: buildMissingCoreMessage(missingFields),
    extra: {
      missingFields
    }
  });
  result.ruleFlags["fields.missing-core"] = true;
  result.riskScores["fields.missing-core"] = normalizeScore(missingFields.length / CORE_FIELD_KEYS.length);
}

function buildMissingCoreTitle(missingFields: Array<(typeof CORE_FIELD_KEYS)[number]>) {
  if (missingFields.includes("workContent")) {
    return "缺少日报内容";
  }

  return "工时缺失或为0";
}

function buildMissingCoreMessage(missingFields: Array<(typeof CORE_FIELD_KEYS)[number]>) {
  const labels = missingFields.map((field) =>
    field === "workContent" ? "工作内容描述" : "已登记工时"
  );

  return `${labels.join("、")}为空或无有效值，属于明确填报缺失，建议优先核对。`;
}

function applySingleHourRules(record: NormalizedRecord, result: RecordAnalysisResult) {
  if (record.registeredHours == null) {
    return;
  }

  if (record.registeredHours < 0.25) {
    applyIssue(result, {
      ruleKey: "hours.single.low",
      severity: "medium",
      title: "单条工时偏低",
      message: `单条工时 ${record.registeredHours}h，建议核对是否存在异常拆分。`,
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

  if (totalHours > 12) {
    applyIssue(result, {
      ruleKey: "hours.daily.high",
      severity: totalHours > 14 ? "high" : "medium",
      title: "单日总工时偏高",
      message: `${record.memberName} 在 ${dayjs(record.workDate).format("YYYY-MM-DD")} 的总工时为 ${totalHours}h。`,
      extra: {}
    });
    result.ruleFlags["hours.daily.high"] = true;
    result.riskScores["hours.daily.high"] = normalizeScore(totalHours / 12);
  }
}

function applyCompletenessRules(record: NormalizedRecord, result: RecordAnalysisResult) {
  const text = normalizeText(record.workContent);
  const isManagementLike = isManagementTask(record.relatedTaskName);

  if (text.length > 0 && text.length < 6) {
    applyIssue(result, {
      ruleKey: "content.too-short",
      severity: "medium",
      title: "内容过短",
      message: "日报内容明显过短，信息量不足，建议补充具体事项或结果。",
      extra: {}
    });
    result.ruleFlags["content.too-short"] = true;
    result.riskScores["content.too-short"] = normalizeScore(1 - text.length / 6);
  } else if (text.length >= 6 && text.length < 12 && !isManagementLike) {
    applyIssue(result, {
      ruleKey: "content.too-short",
      severity: "low",
      title: "内容较短",
      message: "日报描述偏短，建议补充对象、结果或动作细节。",
      extra: {}
    });
    result.ruleFlags["content.too-short"] = true;
    result.riskScores["content.too-short"] = normalizeScore(1 - text.length / 12);
  }

  if (
    text.length > 0 &&
    !hasResultSignal(text) &&
    !hasSufficientDetailSignal(text) &&
    containsActionOnlySignal(text) &&
    text.length < MISSING_RESULT_LONG_TEXT_LENGTH
  ) {
    applyIssue(result, {
      ruleKey: "content.missing-result-signal",
      severity: "low",
      title: "结果痕迹较弱",
      message: "内容以动作描述为主，建议补充结果、输出或阶段结论。",
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
  const isManagementLike = isManagementTask(record.relatedTaskName);

  if (isManagementLike) {
    if (matchRatio > 0 || similarity >= 0.12 || content.length >= 60) {
      return;
    }
  } else if (matchRatio >= 0.2 || similarity >= 0.24 || content.length >= 100) {
    return;
  }

  applyIssue(result, {
    ruleKey: "task.weak-match",
    severity: "low",
    title: "任务匹配较弱",
    message: "工作内容与任务名称的直接匹配较弱，建议作为语义边界样本复核。",
    extra: {
      matchRatio,
      similarity
    }
  });
  result.ruleFlags["task.weak-match"] = true;
  result.riskScores["task.weak-match"] = normalizeScore((1 - Math.max(matchRatio, similarity)) * 0.6);
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

function applyExpressionQualityHints(record: NormalizedRecord, result: RecordAnalysisResult) {
  const text = record.workContent.trim();
  if (!text) {
    return;
  }

  if (shouldFlagGenericProcess(text)) {
    result.ruleFlags["content.generic-process"] = true;
    result.riskScores["content.generic-process"] = 0.12;
  }

  if (shouldFlagMissingProgress(text)) {
    result.ruleFlags["content.missing-progress"] = true;
    result.riskScores["content.missing-progress"] = 0.12;
  }

  if (shouldFlagMeetingTooGeneric(text)) {
    result.ruleFlags["content.meeting-too-generic"] = true;
    result.riskScores["content.meeting-too-generic"] = 0.1;
  }
}

function finalizeResult(record: NormalizedRecord, result: RecordAnalysisResult) {
  result.issueCount = result.issues.length;
  const highCount = result.issues.filter((issue) => issue.severity === "high").length;
  const mediumCount = result.issues.filter((issue) => issue.severity === "medium").length;

  result.riskLevel =
    highCount > 0
      ? "high"
      : mediumCount >= 2 || (mediumCount >= 1 && result.issues.length >= 2)
        ? "medium"
        : result.issues.some(
            (issue) => issue.severity === "low" && issue.ruleKey !== "task.weak-match"
          )
          ? "low"
          : "normal";
  result.ruleRiskLevel = result.riskLevel;
  result.finalRiskLevel = result.aiRiskLevel ?? result.ruleRiskLevel;

  result.needAiReview = shouldMarkNeedAiReview(record, result);
  if (result.needAiReview) {
    result.ruleFlags["needAiReview"] = true;
  } else {
    delete result.ruleFlags["needAiReview"];
  }

  result.summary =
    result.issues.length > 0
      ? result.issues.map((issue) => issue.title).join("；")
      : "未发现明显异常";

  return result;
}

function shouldMarkNeedAiReview(record: NormalizedRecord, result: RecordAnalysisResult) {
  const textLength = normalizeText(record.workContent).length;
  if (textLength < MIN_AI_REVIEW_TEXT_LENGTH) {
    return false;
  }

  if (hasAnyRule(result, ["fields.missing-core", "content.too-short", "content.duplicate-risk"])) {
    return false;
  }

  if (isPureNumericAnomaly(result)) {
    return false;
  }

  const semanticIssueCount = SEMANTIC_REVIEW_RULE_KEYS.filter((ruleKey) =>
    result.ruleFlags[ruleKey] === true
  ).length;
  const hasSemanticWeakness = semanticIssueCount > 0;
  if (!hasSemanticWeakness) {
    return false;
  }

  const isSemanticMediumOrHigh =
    (result.riskLevel === "medium" || result.riskLevel === "high") && !isPureNumericAnomaly(result);
  const isManagementLike = isManagementTask(record.relatedTaskName);
  const hasWeakMatch = result.ruleFlags["task.weak-match"] === true;
  const hasWeakResultSignal = result.ruleFlags["content.missing-result-signal"] === true;
  const hasReviewableText = textLength >= 24 || (textLength >= MIN_AI_REVIEW_TEXT_LENGTH && semanticIssueCount >= 2);
  const hasStrongWeakMatch =
    hasWeakMatch && (result.riskScores["task.weak-match"] ?? 0) >= 0.45 && textLength >= 18;
  const hasReviewableResultWeakness =
    hasWeakResultSignal && (textLength >= 18 || hasSufficientDetailSignal(record.workContent));
  const hasTaskOnlySemanticWeakness = hasWeakMatch && !hasWeakResultSignal;
  const hasReviewableTaskOnlyWeakness =
    hasTaskOnlySemanticWeakness &&
    textLength >= 18 &&
    textLength <= 45 &&
    !hasResultSignal(record.workContent) &&
    !hasSufficientDetailSignal(record.workContent);

  if (!isManagementLike) {
    return (
      (semanticIssueCount >= 2 && hasReviewableText) ||
      (hasStrongWeakMatch && result.riskLevel !== "normal" && hasReviewableText) ||
      hasReviewableTaskOnlyWeakness ||
      (hasReviewableResultWeakness && isSemanticMediumOrHigh)
    );
  }

  if (semanticIssueCount >= 2) {
    return hasReviewableText;
  }

  if (hasStrongWeakMatch || hasReviewableResultWeakness) {
    return hasReviewableResultWeakness || (hasReviewableText && isSemanticMediumOrHigh);
  }

  return false;
}

function isPureNumericAnomaly(result: RecordAnalysisResult) {
  return (
    result.issues.length > 0 &&
    result.issues.every((issue) => issue.ruleKey.startsWith("hours."))
  );
}

function hasAnyRule(result: RecordAnalysisResult, ruleKeys: string[]) {
  return result.issues.some((issue) => ruleKeys.includes(issue.ruleKey));
}

function buildPersonDateKey(record: NormalizedRecord) {
  return `${record.account || ""}__${record.memberName}__${record.workDate}`;
}

function isManagementTask(taskName?: string) {
  return MANAGEMENT_TASK_HINTS.some((keyword) => (taskName || "").includes(keyword));
}

function hasResultSignal(text: string) {
  return RESULT_HINTS.some((keyword) => text.includes(keyword)) || /已完成\d+%/.test(text);
}

function hasSufficientDetailSignal(text: string) {
  const normalized = normalizeText(text);
  const detailHitCount = DETAIL_HINTS.filter((keyword) => normalized.includes(keyword)).length;
  return (
    normalized.length >= MISSING_RESULT_LONG_TEXT_LENGTH ||
    detailHitCount >= 2 ||
    /[，。；、\n].*[，。；、\n]/.test(text)
  );
}

function containsActionOnlySignal(text: string) {
  return ACTION_ONLY_HINTS.some((keyword) => text.includes(keyword));
}

function shouldFlagGenericProcess(text: string) {
  return (
    GENERIC_PROCESS_HINTS.some((keyword) => text.includes(keyword)) &&
    !hasResultSignal(text) &&
    !CONCLUSION_HINTS.some((keyword) => text.includes(keyword)) &&
    !hasStatusSignal(text)
  );
}

function shouldFlagMissingProgress(text: string) {
  return (
    ["继续", "持续", "推进", "优化", "编写", "开发", "调试"].some((keyword) =>
      text.includes(keyword)
    ) &&
    !hasProgressSignal(text)
  );
}

function shouldFlagMeetingTooGeneric(text: string) {
  const hasMeetingHint = MEETING_HINTS.some((keyword) => text.includes(keyword));
  if (!hasMeetingHint) {
    return false;
  }

  const hasMeetingObject = /[A-Za-z0-9\u4e00-\u9fa5]{2,}(项目|系统|需求|方案|模块|接口|平台)/.test(
    text
  );
  const hasMeetingOutcome = MEETING_OUTCOME_HINTS.some((keyword) => text.includes(keyword));

  return !hasMeetingObject && !hasMeetingOutcome;
}

function hasProgressSignal(text: string) {
  return /(\d+%)/.test(text) || hasStatusSignal(text);
}

function hasStatusSignal(text: string) {
  return STATUS_HINTS.some((keyword) => text.includes(keyword));
}

function normalizeScore(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}
