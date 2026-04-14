// @ts-nocheck
import type { DailyReportRecord, RuleDefinition, RuleIssue } from "@/types/domain";
import { defaultRules } from "@/lib/rules/base-rules";

export interface RuleEngineOptions {
  rules?: RuleDefinition[];
  config?: Record<string, unknown>;
}

export function runRuleEngine(
  records: DailyReportRecord[],
  options: RuleEngineOptions = {}
) {
  const rules = options.rules ?? defaultRules;

  const issues = rules.flatMap((rule) =>
    rule.run({
      datasetId: options.config?.datasetId as string,
      records,
      config: options.config ?? {}
    })
  );

  return deduplicateIssues(issues);
}

function deduplicateIssues(issues: RuleIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [
      issue.ruleKey,
      issue.personName,
      issue.recordId,
      issue.taskName,
      issue.relatedRecordIds?.join(",")
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
