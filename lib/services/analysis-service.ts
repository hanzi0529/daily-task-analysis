// @ts-nocheck
import { repositories } from "@/lib/storage/repositories";
import { runRuleEngine } from "@/lib/rules/engine";
import { getAIProvider } from "@/lib/ai/provider";
import type {
  AnalysisResult,
  DailyReportRecord,
  DashboardStats,
  PersonAnalysis,
  TaskAnalysis
} from "@/types/domain";

export async function analyzeDataset(params: {
  datasetId: string;
  fileId: string;
  records: DailyReportRecord[];
  aiProvider?: string;
}) {
  const issues = runRuleEngine(params.records, {
    config: { datasetId: params.datasetId }
  });
  const summary = buildSummary(params.datasetId, params.records, issues);
  const people = buildPeopleAnalysis(params.records, issues);
  const tasks = buildTaskAnalysis(params.records, issues);

  const result: AnalysisResult = {
    datasetId: params.datasetId,
    fileId: params.fileId,
    analyzedAt: new Date().toISOString(),
    summary,
    issues,
    people,
    tasks,
    records: params.records
  };

  const provider = getAIProvider(params.aiProvider);
  result.aiInsights = await provider.analyze({ result });

  await repositories.analysis.save(result);
  return result;
}

export async function getLatestAnalysis() {
  return repositories.analysis.getLatest();
}

export async function getAnalysisByDatasetId(datasetId: string) {
  return repositories.analysis.get(datasetId);
}

function buildSummary(
  datasetId: string,
  records: DailyReportRecord[],
  issues: AnalysisResult["issues"]
): DashboardStats {
  const abnormalPeople = new Set(issues.map((issue) => issue.personName).filter(Boolean));
  const pendingReviewTasks = issues.filter((issue) =>
    issue.ruleKey.includes("pending-review")
  ).length;

  return {
    datasetId,
    totalFiles: 1,
    totalRecords: records.length,
    anomalyCount: issues.length,
    abnormalPeopleCount: abnormalPeople.size,
    pendingReviewTasks
  };
}

function buildPeopleAnalysis(
  records: DailyReportRecord[],
  issues: AnalysisResult["issues"]
) {
  const map = new Map<string, PersonAnalysis>();

  for (const record of records) {
    const current = map.get(record.employeeName) ?? {
      personName: record.employeeName,
      employeeId: record.employeeId,
      recordCount: 0,
      totalHours: 0,
      issueCount: 0,
      riskLevel: "low" as const,
      highlights: []
    };

    current.recordCount += 1;
    current.totalHours += record.workHours ?? 0;
    map.set(record.employeeName, current);
  }

  for (const issue of issues) {
    if (!issue.personName) {
      continue;
    }

    const person = map.get(issue.personName);
    if (!person) {
      continue;
    }

    person.issueCount += 1;
    if (issue.severity === "high") {
      person.riskLevel = "high";
    } else if (issue.severity === "medium" && person.riskLevel === "low") {
      person.riskLevel = "medium";
    }
    person.highlights.push(issue.title);
  }

  return [...map.values()].sort((a, b) => b.issueCount - a.issueCount);
}

function buildTaskAnalysis(
  records: DailyReportRecord[],
  issues: AnalysisResult["issues"]
) {
  const map = new Map<string, TaskAnalysis>();

  for (const record of records) {
    const key = record.taskName || "未命名任务";
    const current = map.get(key) ?? {
      taskName: key,
      taskCode: record.taskCode,
      recordCount: 0,
      pendingReviewCount: 0
    };
    current.recordCount += 1;
    map.set(key, current);
  }

  for (const issue of issues) {
    if (!issue.taskName) {
      continue;
    }
    const task = map.get(issue.taskName);
    if (!task) {
      continue;
    }
    if (issue.ruleKey.includes("pending-review")) {
      task.pendingReviewCount += 1;
    }
  }

  return [...map.values()].sort((a, b) => b.pendingReviewCount - a.pendingReviewCount);
}
