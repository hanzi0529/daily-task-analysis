import type { z } from "zod";

import type {
  analysisDatasetSchema,
  aiReviewProgressSchema,
  dashboardSummarySchema,
  batchAiReportSchema,
  importBatchSchema,
  normalizedRecordSchema,
  parsedDatasetSchema,
  personSummarySchema,
  rawRecordSchema,
  recordAnalysisResultSchema,
  recordListItemSchema,
  riskLevelSchema,
  uploadFileMetaSchema,
  uploadSourceTypeSchema
} from "@/lib/schemas/domain";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type UnknownMap = Record<string, unknown>;

export type UploadSourceType = z.infer<typeof uploadSourceTypeSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type UploadFileMeta = z.infer<typeof uploadFileMetaSchema>;
export type ImportBatch = z.infer<typeof importBatchSchema>;
export type RawRecord = z.infer<typeof rawRecordSchema>;
export type NormalizedRecord = z.infer<typeof normalizedRecordSchema>;
export type RecordAnalysisResult = z.infer<typeof recordAnalysisResultSchema>;
export type RecordListItem = z.infer<typeof recordListItemSchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type AiReviewProgress = z.infer<typeof aiReviewProgressSchema>;
export type BatchAiReport = z.infer<typeof batchAiReportSchema>;
export type PersonSummary = z.infer<typeof personSummarySchema>;
export type ParsedDataset = z.infer<typeof parsedDatasetSchema>;
export type AnalysisDataset = z.infer<typeof analysisDatasetSchema>;
export type AnalysisResult = AnalysisDataset;

export interface ExportColumnConfig {
  key: string;
  title: string;
}

export interface TableColumnConfig {
  key: string;
  title: string;
  width?: string;
}

export interface LocalSourceOptions {
  directoryPath: string;
  extensions: string[];
}

export interface StoragePaths {
  rootDir: string;
  uploadsDir: string;
  parsedDir: string;
  cacheDir: string;
  configDir: string;
}

export type ModelProviderType = "deepseek" | "glm" | "custom";

export interface ModelProviderConfig {
  id: string;
  name: string;
  provider: ModelProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelProviderStore {
  activeConfigId: string | null;
  configs: ModelProviderConfig[];
}
