import {
  analysisDatasetSchema,
  dashboardSummarySchema,
  personSummarySchema,
  recordListItemSchema
} from "@/lib/schemas/domain";
import { parseExcelFileToDataset } from "@/lib/parser/import-pipeline";
import { analyzeRecordsV2 } from "@/lib/rules/analyze-records-v2";
import { repositories } from "@/lib/storage/repositories";
import { createId } from "@/lib/utils";
import type {
  AnalysisDataset,
  DashboardSummary,
  PersonSummary,
  RecordListItem,
  UploadFileMeta
} from "@/types/domain";

export async function importBufferAndAnalyze(params: {
  file: UploadFileMeta;
  buffer: Buffer;
  importMode: "upload" | "local-directory";
}) {
  const datasetId = createId("dataset");
  const batchId = createId("batch");
  const parsed = parseExcelFileToDataset({
    batchId,
    datasetId,
    file: params.file,
    buffer: params.buffer,
    importMode: params.importMode
  });

  await repositories.parsed.save(parsed);

  const analyses = analyzeRecordsV2(parsed.normalizedRecords);
  const analysisByRecordId = new Map(analyses.map((item) => [item.recordId, item]));
  const recordList = parsed.normalizedRecords.map((record) => {
    const analysis = analysisByRecordId.get(record.id);
    return recordListItemSchema.parse({
      id: record.id,
      batchId: record.batchId,
      recordId: record.id,
      rowIndex: record.rowIndex,
      sequenceNo: record.sequenceNo,
      account: record.account,
      memberName: record.memberName,
      workDate: record.workDate,
      registeredHours: record.registeredHours,
      workContent: record.workContent,
      relatedTaskName: record.relatedTaskName,
      riskLevel: analysis?.riskLevel ?? "low",
      issueCount: analysis?.issueCount ?? 0,
      needAiReview: analysis?.needAiReview ?? false,
      ruleFlags: analysis?.ruleFlags ?? {},
      riskScores: analysis?.riskScores ?? {},
      issueTitles: analysis?.issues.map((issue) => issue.title) ?? [],
      aiReviewed: analysis?.aiReviewed ?? false,
      aiSummary: analysis?.aiSummary ?? null,
      aiConfidence: analysis?.aiConfidence ?? null,
      aiReviewLabel: analysis?.aiReviewLabel ?? null,
      aiReviewReason: analysis?.aiReviewReason ?? null,
      aiReviewedAt: analysis?.aiReviewedAt ?? null,
      rawData: record.rawData,
      extraFields: record.extraFields
    });
  });
  const dashboard = buildDashboard({
    datasetId,
    batchId,
    fileName: parsed.batch.file.originalFileName,
    importedAt: parsed.batch.importedAt,
    recordList
  });
  const people = buildPeople(recordList);

  const output = analysisDatasetSchema.parse({
    batch: {
      ...parsed.batch,
      status: "analyzed"
    },
    rawRecords: parsed.rawRecords,
    normalizedRecords: parsed.normalizedRecords,
    analyses,
    recordList,
    dashboard,
    people
  });

  await repositories.analysis.save(output);
  return output;
}

export async function getLatestDatasetAnalysis() {
  return repositories.analysis.getLatest();
}

export async function getDatasetAnalysis(datasetId: string) {
  return repositories.analysis.get(datasetId);
}

export async function getDashboardSummary(datasetId?: string) {
  const dataset = datasetId
    ? await repositories.analysis.get(datasetId)
    : await repositories.analysis.getLatest();

  return dataset?.dashboard ?? emptyDashboard();
}

export async function getRecordList(
  datasetId?: string,
  filters?: {
    date?: string;
    memberName?: string;
    riskLevel?: "low" | "medium" | "high";
    needAiReview?: boolean;
  }
) {
  const dataset = datasetId
    ? await repositories.analysis.get(datasetId)
    : await repositories.analysis.getLatest();

  const records = dataset?.recordList ?? [];
  return records
    .filter((item) => {
      if (filters?.date && item.workDate !== filters.date) {
        return false;
      }
      if (
        filters?.memberName &&
        !item.memberName.toLowerCase().includes(filters.memberName.toLowerCase())
      ) {
        return false;
      }
      if (filters?.riskLevel && item.riskLevel !== filters.riskLevel) {
        return false;
      }
      if (
        typeof filters?.needAiReview === "boolean" &&
        item.needAiReview !== filters.needAiReview
      ) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      ...item,
      primaryIssueTypes: item.issueTitles.slice(0, 3),
      riskReasons: item.issueTitles,
      aiReviewed: item.aiReviewed ?? false,
      aiSummary: item.aiSummary ?? null,
      aiConfidence: item.aiConfidence ?? null,
      aiReviewLabel: item.aiReviewLabel ?? null,
      aiReviewReason: item.aiReviewReason ?? null,
      aiReviewedAt: item.aiReviewedAt ?? null
    }));
}

export async function getPeopleSummary(datasetId?: string) {
  const dataset = datasetId
    ? await repositories.analysis.get(datasetId)
    : await repositories.analysis.getLatest();

  return dataset?.people ?? [];
}

export async function getDashboardPayload(datasetId?: string) {
  const dataset = datasetId
    ? await repositories.analysis.get(datasetId)
    : await repositories.analysis.getLatest();

  if (!dataset) {
    return {
      summary: emptyDashboard(),
      metrics: {
        totalRecords: 0,
        anomalyRecords: 0,
        anomalyRate: 0,
        highRiskPeopleCount: 0,
        needAiReviewCount: 0,
        totalHours: 0
      },
      charts: {
        riskTypeDistribution: [],
        riskLevelDistribution: [],
        dailyAnomalyTrend: []
      },
      topPeople: [],
      topTasks: [],
      managementSummary: []
    };
  }

  const records = dataset.recordList;
  const analyses = dataset.analyses;
  const abnormalRecords = records.filter((item) => item.riskLevel !== "low");
  const highRiskPeople = new Set(
    records.filter((item) => item.riskLevel === "high").map((item) => item.memberName)
  );

  const riskTypeMap = new Map<string, number>();
  for (const analysis of analyses) {
    for (const issue of analysis.issues) {
      riskTypeMap.set(issue.title, (riskTypeMap.get(issue.title) ?? 0) + 1);
    }
  }

  const riskLevelDistribution = [
    { label: "高风险", value: records.filter((item) => item.riskLevel === "high").length },
    { label: "中风险", value: records.filter((item) => item.riskLevel === "medium").length },
    { label: "低风险", value: records.filter((item) => item.riskLevel === "low").length }
  ];

  const dailyTrendMap = new Map<string, number>();
  for (const item of records) {
    if (item.riskLevel === "low") {
      continue;
    }
    dailyTrendMap.set(item.workDate, (dailyTrendMap.get(item.workDate) ?? 0) + 1);
  }

  const topTasks = [...new Map(
    records
      .filter((item) => item.relatedTaskName)
      .map((item) => [item.relatedTaskName!, { taskName: item.relatedTaskName!, riskCount: 0, totalCount: 0 }])
  ).values()];

  for (const task of topTasks) {
    for (const item of records) {
      if (item.relatedTaskName !== task.taskName) {
        continue;
      }
      task.totalCount += 1;
      if (item.riskLevel !== "low") {
        task.riskCount += 1;
      }
    }
  }

  return {
    summary: dataset.dashboard,
    metrics: {
      totalRecords: dataset.dashboard.totalRecords,
      anomalyRecords: abnormalRecords.length,
      anomalyRate:
        dataset.dashboard.totalRecords > 0
          ? Number(
              (
                (abnormalRecords.length / dataset.dashboard.totalRecords) *
                100
              ).toFixed(1)
            )
          : 0,
      highRiskPeopleCount: highRiskPeople.size,
      needAiReviewCount: dataset.dashboard.needAiReviewCount,
      totalHours: dataset.dashboard.totalHours
    },
    charts: {
      riskTypeDistribution: [...riskTypeMap.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 8),
      riskLevelDistribution,
      dailyAnomalyTrend: [...dailyTrendMap.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((left, right) => left.date.localeCompare(right.date))
    },
    topPeople: [...dataset.people]
      .sort((left, right) => {
        if (right.riskLevel !== left.riskLevel) {
          return riskSortValue(right.riskLevel) - riskSortValue(left.riskLevel);
        }
        return right.anomalyCount - left.anomalyCount;
      })
      .slice(0, 10),
    topTasks: topTasks
      .filter((item) => item.riskCount > 0)
      .sort((left, right) => right.riskCount - left.riskCount)
      .slice(0, 10),
    managementSummary: buildManagementSummary(dataset)
  };
}

function buildManagementSummary(dataset: AnalysisDataset) {
  const lines: string[] = [];
  lines.push(
    `本次导入 ${dataset.dashboard.totalRecords} 条日报，识别异常 ${dataset.dashboard.anomalyRecords} 条。`
  );
  lines.push(
    `需要 AI 复核 ${dataset.dashboard.needAiReviewCount} 条，高风险人员 ${new Set(dataset.recordList.filter((item) => item.riskLevel === "high").map((item) => item.memberName)).size} 人。`
  );

  const topIssue = dataset.analyses
    .flatMap((item) => item.issues.map((issue) => issue.title))
    .reduce<Map<string, number>>((map, title) => {
      map.set(title, (map.get(title) ?? 0) + 1);
      return map;
    }, new Map());

  const first = [...topIssue.entries()].sort((left, right) => right[1] - left[1])[0];
  if (first) {
    lines.push(`当前最主要的风险类型是“${first[0]}”，共 ${first[1]} 条。`);
  }

  return lines;
}

function buildDashboard(params: {
  datasetId: string;
  batchId: string;
  fileName: string;
  importedAt: string;
  recordList: RecordListItem[];
}): DashboardSummary {
  const abnormalPeople = new Set(
    params.recordList
      .filter((item) => item.riskLevel !== "low")
      .map((item) => item.memberName)
  );

  return dashboardSummarySchema.parse({
    datasetId: params.datasetId,
    batchId: params.batchId,
    fileName: params.fileName,
    importedAt: params.importedAt,
    totalRecords: params.recordList.length,
    analyzedRecords: params.recordList.length,
    anomalyRecords: params.recordList.filter((item) => item.riskLevel !== "low").length,
    abnormalPeopleCount: abnormalPeople.size,
    needAiReviewCount: params.recordList.filter((item) => item.needAiReview).length,
    duplicateRiskCount: params.recordList.filter(
      (item) => item.ruleFlags["content.duplicate-risk"] === true
    ).length,
    dailyHourAnomalyCount: params.recordList.filter(
      (item) =>
        item.ruleFlags["hours.daily.high"] === true ||
        item.ruleFlags["hours.daily.low"] === true
    ).length,
    totalHours: Number(
      params.recordList.reduce((sum, item) => sum + (item.registeredHours ?? 0), 0).toFixed(2)
    ),
    averageHours:
      params.recordList.length > 0
        ? Number(
            (
              params.recordList.reduce((sum, item) => sum + (item.registeredHours ?? 0), 0) /
              params.recordList.length
            ).toFixed(2)
          )
        : 0,
    extra: {}
  });
}

function buildPeople(recordList: RecordListItem[]): PersonSummary[] {
  const map = new Map<string, PersonSummary>();

  for (const item of recordList) {
    const current = map.get(item.memberName) ?? {
      memberName: item.memberName,
      account: item.account,
      recordCount: 0,
      totalHours: 0,
      anomalyCount: 0,
      needAiReviewCount: 0,
      riskLevel: "low" as const,
      highlights: []
    };

    current.recordCount += 1;
    current.totalHours += item.registeredHours ?? 0;
    current.anomalyCount += item.riskLevel !== "low" ? 1 : 0;
    current.needAiReviewCount += item.needAiReview ? 1 : 0;
    if (item.riskLevel === "high") {
      current.riskLevel = "high";
    } else if (item.riskLevel === "medium" && current.riskLevel === "low") {
      current.riskLevel = "medium";
    }
    current.highlights.push(...item.issueTitles);
    map.set(item.memberName, current);
  }

  return [...map.values()]
    .map((item) =>
      personSummarySchema.parse({
        ...item,
        totalHours: Number(item.totalHours.toFixed(2)),
        highlights: [...new Set(item.highlights)].slice(0, 6)
      })
    )
    .sort((left, right) => right.anomalyCount - left.anomalyCount);
}

function emptyDashboard() {
  return dashboardSummarySchema.parse({
    datasetId: "",
    batchId: "",
    fileName: "",
    importedAt: "",
    totalRecords: 0,
    analyzedRecords: 0,
    anomalyRecords: 0,
    abnormalPeopleCount: 0,
    needAiReviewCount: 0,
    duplicateRiskCount: 0,
    dailyHourAnomalyCount: 0,
    totalHours: 0,
    averageHours: 0,
    extra: {}
  });
}

function riskSortValue(level: "low" | "medium" | "high") {
  if (level === "high") {
    return 3;
  }
  if (level === "medium") {
    return 2;
  }
  return 1;
}
