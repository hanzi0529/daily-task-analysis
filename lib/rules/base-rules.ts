// @ts-nocheck
import dayjs from "dayjs";

import { ruleThresholds } from "@/config/app";
import { createId } from "@/lib/utils";
import type { RuleDefinition, RuleIssue } from "@/types/domain";
import { hasResultSignal, normalizeText, simpleSimilarity } from "@/lib/rules/helpers";

const workingHoursRule: RuleDefinition = {
  key: "hours.anomaly",
  description: "识别单条工时和单日总工时异常",
  run: ({ records }) => {
    const issues: RuleIssue[] = [];
    const byPersonDate = new Map<string, number>();

    for (const record of records) {
      const hours = record.workHours ?? 0;
      const dailyKey = `${record.employeeName}_${record.reportDate}`;
      byPersonDate.set(dailyKey, (byPersonDate.get(dailyKey) ?? 0) + hours);

      if (record.workHours != null && hours > ruleThresholds.maxSingleRecordHours) {
        issues.push({
          id: createId("issue"),
          ruleKey: "hours.single.high",
          severity: "high",
          title: "单条工时偏高",
          message: `单条工时 ${hours}h，超过阈值`,
          scope: "record",
          personName: record.employeeName,
          taskName: record.taskName,
          recordId: record.id
        });
      }

      if (record.workHours != null && hours < ruleThresholds.minSingleRecordHours) {
        issues.push({
          id: createId("issue"),
          ruleKey: "hours.single.low",
          severity: "medium",
          title: "单条工时偏低",
          message: `单条工时 ${hours}h，建议复核拆分合理性`,
          scope: "record",
          personName: record.employeeName,
          taskName: record.taskName,
          recordId: record.id
        });
      }
    }

    for (const [key, total] of byPersonDate.entries()) {
      if (total > ruleThresholds.maxDailyHours || total < ruleThresholds.minDailyHours) {
        const [personName, reportDate] = key.split("_");
        issues.push({
          id: createId("issue"),
          ruleKey: "hours.daily.anomaly",
          severity: total > ruleThresholds.maxDailyHours ? "high" : "medium",
          title: "单日总工时异常",
          message: `${personName} 在 ${dayjs(reportDate).format("YYYY-MM-DD")} 的总工时为 ${total}h`,
          scope: "person",
          personName
        });
      }
    }

    return issues;
  }
};

const completenessRule: RuleDefinition = {
  key: "content.completeness",
  description: "识别内容过短和结果痕迹不足",
  run: ({ records }) =>
    records.flatMap((record) => {
      const issues: RuleIssue[] = [];
      const normalized = normalizeText(record.content);

      if (normalized.length < ruleThresholds.minContentLength) {
        issues.push({
          id: createId("issue"),
          ruleKey: "content.too-short",
          severity: "medium",
          title: "日报内容过短",
          message: "内容长度不足，可能缺少有效信息",
          scope: "record",
          personName: record.employeeName,
          taskName: record.taskName,
          recordId: record.id
        });
      }

      if (normalized && !hasResultSignal(normalized)) {
        issues.push({
          id: createId("issue"),
          ruleKey: "content.missing-result-signal",
          severity: "low",
          title: "缺少结果痕迹",
          message: "内容更像动作描述，建议补充结果或产出",
          scope: "record",
          personName: record.employeeName,
          taskName: record.taskName,
          recordId: record.id
        });
      }

      return issues;
    })
};

const taskWeakMatchRule: RuleDefinition = {
  key: "task.weak-match",
  description: "基础任务关键词弱匹配时标记待复核",
  run: ({ records }) =>
    records.flatMap((record) => {
      if (!record.taskName || !record.content) {
        return [];
      }

      const taskTokens = normalizeText(record.taskName)
        .split(" ")
        .filter(Boolean);
      const content = normalizeText(record.content);
      const matched = taskTokens.filter((token) => content.includes(token)).length;

      if (taskTokens.length > 0 && matched / taskTokens.length < 0.3) {
        return [
          {
            id: createId("issue"),
            ruleKey: "task.pending-review",
            severity: "low",
            title: "任务匹配较弱",
            message: "任务名称与日报内容的关键词关联度较低，建议复核",
            scope: "task",
            personName: record.employeeName,
            taskName: record.taskName,
            recordId: record.id
          }
        ];
      }

      return [];
    })
};

const duplicateContentRule: RuleDefinition = {
  key: "content.duplicate-risk",
  description: "同一人同一天多条描述高度相似时标记风险",
  run: ({ records }) => {
    const issues: RuleIssue[] = [];
    const groups = new Map<string, typeof records>();

    for (const record of records) {
      const key = `${record.employeeName}_${record.reportDate}`;
      const current = groups.get(key) ?? [];
      current.push(record);
      groups.set(key, current);
    }

    for (const groupRecords of groups.values()) {
      for (let index = 0; index < groupRecords.length; index += 1) {
        for (let nextIndex = index + 1; nextIndex < groupRecords.length; nextIndex += 1) {
          const left = groupRecords[index];
          const right = groupRecords[nextIndex];
          const similarity = simpleSimilarity(left.content, right.content);

          if (similarity >= ruleThresholds.duplicateSimilarityThreshold) {
            issues.push({
              id: createId("issue"),
              ruleKey: "content.duplicate-risk",
              severity: "medium",
              title: "同日多条描述高度相似",
              message: "同一人员同一天多条日报内容高度相似，建议复核是否重复填报",
              scope: "person",
              personName: left.employeeName,
              relatedRecordIds: [left.id, right.id]
            });
          }
        }
      }
    }

    return issues;
  }
};

export const defaultRules: RuleDefinition[] = [
  workingHoursRule,
  completenessRule,
  taskWeakMatchRule,
  duplicateContentRule
];
