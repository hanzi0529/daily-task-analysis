import { getDashboardPayload } from "@/lib/services/dataset-analysis-service";

export async function getDashboardApiPayload(datasetId?: string) {
  return getDashboardPayload(datasetId);
}
