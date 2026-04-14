// @ts-nocheck
import { getAnalysisByDatasetId, getLatestAnalysis } from "@/lib/services/analysis-service";

export async function getDashboardData(datasetId?: string) {
  const analysis = datasetId
    ? await getAnalysisByDatasetId(datasetId)
    : await getLatestAnalysis();

  return (
    analysis ?? {
      datasetId: undefined,
      summary: {
        totalFiles: 0,
        totalRecords: 0,
        anomalyCount: 0,
        abnormalPeopleCount: 0,
        pendingReviewTasks: 0
      },
      issues: [],
      people: [],
      tasks: [],
      records: []
    }
  );
}

export async function getReportList(datasetId?: string) {
  const analysis = await getDashboardData(datasetId);
  return analysis.records;
}

export async function getPeopleList(datasetId?: string) {
  const analysis = await getDashboardData(datasetId);
  return analysis.people;
}
