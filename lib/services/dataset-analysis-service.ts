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
    const ruleRiskLevel = analysis?.ruleRiskLevel ?? analysis?.riskLevel ?? "normal";
    const finalRiskLevel = analysis?.finalRiskLevel ?? ruleRiskLevel;
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
      riskLevel: ruleRiskLevel,
      ruleRiskLevel,
      aiRiskLevel: analysis?.aiRiskLevel ?? null,
      finalRiskLevel,
      issueCount: analysis?.issueCount ?? 0,
      needAiReview: analysis?.needAiReview ?? false,
      ruleFlags: analysis?.ruleFlags ?? {},
      riskScores: analysis?.riskScores ?? {},
      issueTitles: analysis?.issues.map((issue) => issue.title) ?? [],
      aiReviewed: analysis?.aiReviewed ?? false,
      aiSummary: analysis?.aiSummary ?? null,
      aiConfidence: analysis?.aiConfidence ?? null,
      aiReviewLabel: analysis?.aiReviewLabel ?? null,
      aiSuggestion: analysis?.aiSuggestion ?? null,
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
    datasetId,
    batchId,
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
  // Register this dataset as "latest" in the stable import-order index.
  // This is the only place setLatest() is called — AI review save() never touches the index.
  await repositories.analysis.setLatest(datasetId);
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
    riskLevel?: "normal" | "low" | "medium" | "high";
    needAiReview?: boolean;
  }
) {
  const dataset = datasetId
    ? await repositories.analysis.get(datasetId)
    : await repositories.analysis.getLatest();

  const records = dataset?.recordList ?? [];
  return records
    .filter((item) => {
      const effectiveRiskLevel = getEffectiveRiskLevel(item);
      if (filters?.date && item.workDate !== filters.date) {
        return false;
      }
      if (
        filters?.memberName &&
        !item.memberName.toLowerCase().includes(filters.memberName.toLowerCase())
      ) {
        return false;
      }
      if (filters?.riskLevel && effectiveRiskLevel !== filters.riskLevel) {
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
    .map((item) => {
      const effectiveRiskLevel = getEffectiveRiskLevel(item);
      const aiReviewed = item.aiReviewed ?? false;
      const aiSummary = item.aiSummary ?? null;
      const aiReviewLabel = item.aiReviewLabel ?? null;
      const aiSuggestion = item.aiSuggestion ?? null;
      const aiReviewReason = item.aiReviewReason ?? null;
      const hasAiContent = Boolean(
        [aiSummary, aiReviewLabel, aiSuggestion, aiReviewReason].find((value) => Boolean(value))
      );

      return {
        ...item,
        riskLevel: effectiveRiskLevel,
        ruleRiskLevel: item.ruleRiskLevel ?? item.riskLevel,
        aiRiskLevel: item.aiRiskLevel ?? null,
        finalRiskLevel: effectiveRiskLevel,
        needAiReview: item.needAiReview ?? false,
        primaryIssueTypes: item.issueTitles.slice(0, 3),
        riskReasons: item.issueTitles,
        aiReviewed,
        hasAiContent,
        aiSummary,
        aiConfidence: item.aiConfidence ?? null,
        aiReviewLabel,
        aiSuggestion,
        aiReviewReason,
        aiReviewedAt: item.aiReviewedAt ?? null
      };
    });
}

export async function getPeopleSummary(datasetId?: string) {
  const dataset = datasetId
    ? await repositories.analysis.get(datasetId)
    : await repositories.analysis.getLatest();

  return dataset?.people ?? [];
}

function computeHighestRiskLevel(riskLevels: string[]): string {
  const order = ["high", "medium", "low", "normal"];
  for (const level of order) {
    if (riskLevels.includes(level)) return level;
  }
  return "normal";
}

export async function getPeopleAnalysis(
  datasetId?: string,
  filters?: {
    memberName?: string;
    riskLevel?: "normal" | "low" | "medium" | "high";
    startDate?: string;
    endDate?: string;
    needAiReview?: boolean;
  }
) {
  const dataset = datasetId
    ? await repositories.analysis.get(datasetId)
    : await repositories.analysis.getLatest();

  if (!dataset) {
    return [];
  }

  const records = await getRecordList(datasetId);
  const recordMap = new Map<string, typeof records>();

  for (const record of records) {
    const current = recordMap.get(record.memberName) ?? [];
    current.push(record);
    recordMap.set(record.memberName, current);
  }

  const hasRecordFilter =
    filters?.startDate !== undefined ||
    filters?.endDate !== undefined ||
    filters?.needAiReview !== undefined ||
    filters?.riskLevel !== undefined;

  return dataset.people
    .filter((person) => {
      if (
        filters?.memberName &&
        !person.memberName.toLowerCase().includes(filters.memberName.toLowerCase())
      ) {
        return false;
      }
      return true;
    })
    .map((person) => {
      const filteredRecords = (recordMap.get(person.memberName) ?? [])
        .filter((record) => {
          if (filters?.startDate && record.workDate < filters.startDate) return false;
          if (filters?.endDate && record.workDate > filters.endDate) return false;
          if (filters?.needAiReview !== undefined && record.needAiReview !== filters.needAiReview) return false;
          if (filters?.riskLevel && record.riskLevel !== filters.riskLevel) return false;
          return true;
        })
        .sort((left, right) => {
          if (right.workDate !== left.workDate) {
            return right.workDate.localeCompare(left.workDate);
          }
          return left.rowIndex - right.rowIndex;
        });

      const derivedStats = hasRecordFilter
        ? {
            recordCount: filteredRecords.length,
            totalHours: Math.round(
              filteredRecords.reduce((sum, r) => sum + (r.registeredHours ?? 0), 0) * 10
            ) / 10,
            anomalyCount: filteredRecords.filter((r) => r.riskLevel !== "normal").length,
            needAiReviewCount: filteredRecords.filter((r) => r.needAiReview).length,
            riskLevel: computeHighestRiskLevel(filteredRecords.map((r) => r.riskLevel))
          }
        : {};

      return {
        ...person,
        ...derivedStats,
        records: filteredRecords.map((record) => ({
          id: record.id,
          workDate: record.workDate,
          relatedTaskName: record.relatedTaskName ?? "-",
          workContent: record.workContent,
          riskLevel: record.riskLevel,
          ruleRiskLevel: record.ruleRiskLevel ?? record.riskLevel,
          aiRiskLevel: record.aiRiskLevel ?? null,
          finalRiskLevel: record.finalRiskLevel ?? record.riskLevel,
          issueCount: record.issueCount,
          primaryIssueTypes: record.primaryIssueTypes,
          riskReasons: record.riskReasons,
          needAiReview: record.needAiReview,
          aiReviewed: record.aiReviewed,
          aiSummary: record.aiSummary,
          aiReviewLabel: record.aiReviewLabel,
          aiSuggestion: record.aiSuggestion,
          aiReviewReason: record.aiReviewReason
        }))
      };
    })
    .filter((person) => !hasRecordFilter || person.records.length > 0)
    .sort((left, right) => {
      if (right.anomalyCount !== left.anomalyCount) {
        return right.anomalyCount - left.anomalyCount;
      }
      return riskSortValue(right.riskLevel) - riskSortValue(left.riskLevel);
    });
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
  const abnormalRecords = records.filter((item) =>
    isAnomalyRiskRecord({ riskLevel: getEffectiveRiskLevel(item) })
  );
  const highRiskPeople = new Set(
    records
      .filter((item) => getEffectiveRiskLevel(item) === "high")
      .map((item) => item.memberName)
  );

  const riskTypeMap = new Map<string, number>();
  const recordRiskById = new Map(
    records.map((item) => [item.recordId, getEffectiveRiskLevel(item)] as const)
  );
  for (const analysis of analyses) {
    if (!isAnomalyRiskRecord({ riskLevel: recordRiskById.get(analysis.recordId) ?? "normal" })) {
      continue;
    }
    for (const issue of analysis.issues) {
      riskTypeMap.set(issue.title, (riskTypeMap.get(issue.title) ?? 0) + 1);
    }
  }

  const riskLevelDistribution = [
    { label: "高风险", value: records.filter((item) => getEffectiveRiskLevel(item) === "high").length },
    { label: "中风险", value: records.filter((item) => getEffectiveRiskLevel(item) === "medium").length },
    { label: "低风险", value: records.filter((item) => getEffectiveRiskLevel(item) === "low").length },
    { label: "正常", value: records.filter((item) => getEffectiveRiskLevel(item) === "normal").length }
  ];

  const dailyTrendMap = new Map<string, number>();
  for (const item of records) {
    if (!isAnomalyRiskRecord(item)) {
      continue;
    }
    dailyTrendMap.set(item.workDate, (dailyTrendMap.get(item.workDate) ?? 0) + 1);
  }

  const issueTitlesByRecordId = new Map(
    analyses.map((item) => [item.recordId, item.issues.map((issue) => issue.title)] as const)
  );
  const highRiskTasks = [...new Map(
    records
      .filter((item) => getEffectiveRiskLevel(item) === "high")
      .map((item) => {
        const taskName = item.relatedTaskName || "未关联任务";
        return [
          taskName,
          {
            taskName,
            riskCount: 0,
            totalCount: 0,
            issueTypes: [] as string[]
          }
        ];
      })
  ).values()];

  for (const task of highRiskTasks) {
    for (const item of records) {
      const taskName = item.relatedTaskName || "未关联任务";
      if (taskName !== task.taskName) {
        continue;
      }
      task.totalCount += 1;
      if (getEffectiveRiskLevel(item) === "high") {
        task.riskCount += 1;
        task.issueTypes.push(...(issueTitlesByRecordId.get(item.recordId) ?? item.issueTitles));
      }
    }
    task.issueTypes = [...new Set(task.issueTypes)];
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
      .filter((item) => item.riskLevel === "high")
      .sort((left, right) => {
        if (right.riskLevel !== left.riskLevel) {
          return riskSortValue(right.riskLevel) - riskSortValue(left.riskLevel);
        }
        return right.anomalyCount - left.anomalyCount;
      }),
    topTasks: highRiskTasks
      .filter((item) => item.riskCount > 0)
      .sort((left, right) => {
        const leftMissing = hasMissingContentIssue(left.issueTypes) ? 1 : 0;
        const rightMissing = hasMissingContentIssue(right.issueTypes) ? 1 : 0;
        if (rightMissing !== leftMissing) {
          return rightMissing - leftMissing;
        }
        return right.riskCount - left.riskCount;
      }),
    managementSummary: buildManagementSummary(dataset)
  };
}

function hasMissingContentIssue(issueTypes: string[]) {
  return issueTypes.some((title) => title.includes("缺少日报内容") || title.includes("工时缺失"));
}

function buildManagementSummary(dataset: AnalysisDataset) {
  const lines: string[] = [];
  lines.push(
    `本次导入 ${dataset.dashboard.totalRecords} 条日报，识别异常 ${dataset.dashboard.anomalyRecords} 条。`
  );
  lines.push(
    `需要 AI 复核 ${dataset.dashboard.needAiReviewCount} 条，高风险人员 ${new Set(dataset.recordList.filter((item) => getEffectiveRiskLevel(item) === "high").map((item) => item.memberName)).size} 人。`
  );

  const riskRecordIds = new Set(
    dataset.recordList.filter(isAnomalyRiskRecord).map((item) => item.recordId)
  );
  const topIssue = dataset.analyses
    .filter((item) => riskRecordIds.has(item.recordId))
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
      .filter(isAnomalyRiskRecord)
      .map((item) => item.memberName)
  );

  return dashboardSummarySchema.parse({
    datasetId: params.datasetId,
    batchId: params.batchId,
    fileName: params.fileName,
    importedAt: params.importedAt,
    totalRecords: params.recordList.length,
    analyzedRecords: params.recordList.length,
    anomalyRecords: params.recordList.filter(isAnomalyRiskRecord).length,
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
      riskLevel: "normal" as const,
      highlights: []
    };

    current.recordCount += 1;
    current.totalHours += item.registeredHours ?? 0;
    current.anomalyCount += isAnomalyRiskRecord(item) ? 1 : 0;
    current.needAiReviewCount += item.needAiReview ? 1 : 0;
    const effectiveRiskLevel = getEffectiveRiskLevel(item);
    if (effectiveRiskLevel === "high") {
      current.riskLevel = "high";
    } else if (effectiveRiskLevel === "medium" && !["high", "medium"].includes(current.riskLevel)) {
      current.riskLevel = "medium";
    } else if (effectiveRiskLevel === "low" && current.riskLevel === "normal") {
      current.riskLevel = "low";
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

function riskSortValue(level: string) {
  if (level === "high") {
    return 3;
  }
  if (level === "medium") {
    return 2;
  }
  if (level === "low") {
    return 1;
  }
  return 0;
}

function isAnomalyRiskRecord(item: { riskLevel: "normal" | "low" | "medium" | "high" }) {
  return item.riskLevel === "medium" || item.riskLevel === "high";
}

export function rebuildAnalysisDatasetDerivedState(dataset: AnalysisDataset) {
  const recordList = dataset.recordList.map((item) =>
    recordListItemSchema.parse({
      ...item,
      ruleRiskLevel: item.ruleRiskLevel ?? item.riskLevel,
      aiRiskLevel: item.aiRiskLevel ?? null,
      finalRiskLevel: item.finalRiskLevel ?? item.ruleRiskLevel ?? item.riskLevel
    })
  );

  return analysisDatasetSchema.parse({
    ...dataset,
    dashboard: buildDashboard({
      datasetId: dataset.datasetId,
      batchId: dataset.batchId,
      fileName: dataset.batch.file.originalFileName,
      importedAt: dataset.batch.importedAt,
      recordList
    }),
    people: buildPeople(recordList),
    recordList
  });
}

function getEffectiveRiskLevel(item: {
  riskLevel: "normal" | "low" | "medium" | "high";
  finalRiskLevel?: "normal" | "low" | "medium" | "high";
}) {
  return item.finalRiskLevel ?? item.riskLevel;
}
