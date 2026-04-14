import { z } from "zod";

const stringOrNumberSchema = z.union([z.string(), z.number()]);

export const extensibleObjectSchema = z.record(z.string(), z.unknown());
export const uploadSourceTypeSchema = z.enum([
  "upload",
  "local-directory",
  "future-auto-fetch"
]);
export const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const uploadFileMetaSchema = z
  .object({
    id: z.string(),
    batchId: z.string().optional(),
    originalFileName: z.string(),
    storedFileName: z.string(),
    storedFilePath: z.string(),
    sizeBytes: z.number().nonnegative(),
    mimeType: z.string().optional(),
    sourceType: uploadSourceTypeSchema,
    importedAt: z.string(),
    extra: extensibleObjectSchema.default({})
  })
  .passthrough();

export const importBatchSchema = z
  .object({
    batchId: z.string(),
    datasetId: z.string(),
    status: z.enum(["imported", "parsed", "analyzed", "failed"]),
    importMode: z.enum(["upload", "local-directory"]),
    parserVersion: z.string(),
    file: uploadFileMetaSchema,
    sheetName: z.string(),
    rawHeaders: z.array(z.string()),
    totalRawRecords: z.number().nonnegative(),
    totalNormalizedRecords: z.number().nonnegative(),
    importedAt: z.string(),
    extra: extensibleObjectSchema.default({})
  })
  .passthrough();

export const rawRecordSchema = z
  .object({
    id: z.string(),
    batchId: z.string(),
    sheetName: z.string(),
    rowIndex: z.number().int().positive(),
    sequenceNo: stringOrNumberSchema.optional(),
    account: z.string().optional(),
    memberName: z.string().optional(),
    workStartTime: z.string().optional(),
    registeredHours: z.number().optional(),
    workContent: z.string().optional(),
    relatedTaskName: z.string().optional(),
    rawData: extensibleObjectSchema,
    extraFields: extensibleObjectSchema.default({})
  })
  .passthrough();

export const normalizedRecordSchema = z
  .object({
    id: z.string(),
    batchId: z.string(),
    rawRecordId: z.string(),
    rowIndex: z.number().int().positive(),
    sequenceNo: z.string().optional(),
    account: z.string().optional(),
    memberName: z.string(),
    workDate: z.string(),
    workStartTime: z.string().optional(),
    registeredHours: z.number().optional(),
    workContent: z.string(),
    relatedTaskName: z.string().optional(),
    normalizedContent: z.string().optional(),
    rawData: extensibleObjectSchema,
    extraFields: extensibleObjectSchema.default({})
  })
  .passthrough();

export const recordIssueSchema = z
  .object({
    ruleKey: z.string(),
    severity: riskLevelSchema,
    title: z.string(),
    message: z.string(),
    extra: extensibleObjectSchema.default({})
  })
  .passthrough();

export const recordAnalysisResultSchema = z
  .object({
    id: z.string(),
    batchId: z.string(),
    recordId: z.string(),
    memberName: z.string(),
    workDate: z.string(),
    relatedTaskName: z.string().optional(),
    riskLevel: riskLevelSchema,
    issueCount: z.number().nonnegative(),
    needAiReview: z.boolean().default(false),
    ruleFlags: z
      .record(z.string(), z.union([z.boolean(), z.number(), z.string()]))
      .default({}),
    riskScores: z.record(z.string(), z.number()).default({}),
    issues: z.array(recordIssueSchema).default([]),
    summary: z.string().default(""),
    aiReviewed: z.boolean().default(false),
    aiSummary: z.string().nullable().optional(),
    aiConfidence: z.number().nullable().optional(),
    aiReviewLabel: z.string().nullable().optional(),
    aiReviewReason: z.string().nullable().optional(),
    aiReviewedAt: z.string().nullable().optional(),
    extra: extensibleObjectSchema.default({})
  })
  .passthrough();

export const recordListItemSchema = z
  .object({
    id: z.string(),
    batchId: z.string(),
    recordId: z.string(),
    rowIndex: z.number().int().positive(),
    sequenceNo: z.string().optional(),
    account: z.string().optional(),
    memberName: z.string(),
    workDate: z.string(),
    registeredHours: z.number().optional(),
    workContent: z.string(),
    relatedTaskName: z.string().optional(),
    riskLevel: riskLevelSchema,
    issueCount: z.number().nonnegative(),
    needAiReview: z.boolean(),
    ruleFlags: z
      .record(z.string(), z.union([z.boolean(), z.number(), z.string()]))
      .default({}),
    riskScores: z.record(z.string(), z.number()).default({}),
    issueTitles: z.array(z.string()).default([]),
    aiReviewed: z.boolean().default(false),
    aiSummary: z.string().nullable().optional(),
    aiConfidence: z.number().nullable().optional(),
    aiReviewLabel: z.string().nullable().optional(),
    aiReviewReason: z.string().nullable().optional(),
    aiReviewedAt: z.string().nullable().optional(),
    rawData: extensibleObjectSchema,
    extraFields: extensibleObjectSchema.default({})
  })
  .passthrough();

export const dashboardSummarySchema = z
  .object({
    datasetId: z.string(),
    batchId: z.string(),
    fileName: z.string(),
    importedAt: z.string(),
    totalRecords: z.number().nonnegative(),
    analyzedRecords: z.number().nonnegative(),
    anomalyRecords: z.number().nonnegative(),
    abnormalPeopleCount: z.number().nonnegative(),
    needAiReviewCount: z.number().nonnegative(),
    duplicateRiskCount: z.number().nonnegative(),
    dailyHourAnomalyCount: z.number().nonnegative(),
    totalHours: z.number().nonnegative(),
    averageHours: z.number().nonnegative(),
    extra: extensibleObjectSchema.default({})
  })
  .passthrough();

export const batchAiReportSchema = z
  .object({
    overview: z.string().default(""),
    majorFindings: z.array(z.string()).default([]),
    riskInsights: z.array(z.string()).default([]),
    focusPeopleSuggestions: z.array(z.string()).default([]),
    focusTaskSuggestions: z.array(z.string()).default([]),
    managementSuggestions: z.array(z.string()).default([]),
    reportingSummary: z.string().default(""),
    generatedAt: z.string().nullable().optional(),
    extra: extensibleObjectSchema.default({})
  })
  .passthrough();

export const personSummarySchema = z
  .object({
    memberName: z.string(),
    account: z.string().optional(),
    recordCount: z.number().nonnegative(),
    totalHours: z.number().nonnegative(),
    anomalyCount: z.number().nonnegative(),
    needAiReviewCount: z.number().nonnegative(),
    riskLevel: riskLevelSchema,
    highlights: z.array(z.string()).default([])
  })
  .passthrough();

export const parsedDatasetSchema = z
  .object({
    batch: importBatchSchema,
    rawRecords: z.array(rawRecordSchema),
    normalizedRecords: z.array(normalizedRecordSchema)
  })
  .passthrough();

export const analysisDatasetSchema = z
  .object({
    batch: importBatchSchema,
    rawRecords: z.array(rawRecordSchema),
    normalizedRecords: z.array(normalizedRecordSchema),
    analyses: z.array(recordAnalysisResultSchema),
    recordList: z.array(recordListItemSchema),
    dashboard: dashboardSummarySchema,
    people: z.array(personSummarySchema).default([]),
    batchAiReport: batchAiReportSchema.nullable().optional()
  })
  .passthrough();
