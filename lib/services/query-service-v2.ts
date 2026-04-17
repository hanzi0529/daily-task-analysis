import {
  getDashboardPayload,
  getDashboardSummary,
  getDatasetAnalysis,
  getLatestDatasetAnalysis,
  getPeopleAnalysis,
  getPeopleSummary,
  getRecordList
} from "@/lib/services/dataset-analysis-service";

export async function getDatasetAnalysisV2(datasetId?: string) {
  return datasetId ? getDatasetAnalysis(datasetId) : getLatestDatasetAnalysis();
}

export async function getDashboardSummaryV2(datasetId?: string) {
  return getDashboardSummary(datasetId);
}

export async function getDashboardPayloadV2(datasetId?: string) {
  return getDashboardPayload(datasetId);
}

export async function getRecordListV2(
  datasetId?: string,
  filters?: {
    date?: string;
    memberName?: string;
    riskLevel?: "normal" | "low" | "medium" | "high";
    needAiReview?: boolean;
  }
) {
  return getRecordList(datasetId, filters);
}

export async function getPeopleListV2(datasetId?: string) {
  return getPeopleSummary(datasetId);
}

export async function getPeopleAnalysisV2(
  datasetId?: string,
  filters?: {
    memberName?: string;
    riskLevel?: "normal" | "low" | "medium" | "high";
    startDate?: string;
    endDate?: string;
    needAiReview?: boolean;
  }
) {
  return getPeopleAnalysis(datasetId, filters);
}
