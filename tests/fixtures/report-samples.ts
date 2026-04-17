import dayjs from "dayjs";

import { excelFieldAliases } from "@/lib/parser/field-mapping";
import type { NormalizedRecord, RecordListItem, UnknownMap } from "@/types/domain";

const EXCEL_HEADERS = {
  sequenceNo: excelFieldAliases.sequenceNo[0],
  account: excelFieldAliases.account[0],
  memberName: excelFieldAliases.memberName[0],
  workStartTime: excelFieldAliases.workStartTime[0],
  registeredHours: excelFieldAliases.registeredHours[0],
  workContent: excelFieldAliases.workContent[0],
  relatedTaskName: excelFieldAliases.relatedTaskName[0]
} as const;

type SampleExcelRowInput = {
  sequenceNo?: string | number;
  account?: string;
  memberName?: string;
  workStartTime?: string;
  registeredHours?: string | number;
  workContent?: string;
  relatedTaskName?: string;
  extraFields?: UnknownMap;
};

type SampleNormalizedInput = {
  id?: string;
  batchId?: string;
  rawRecordId?: string;
  rowIndex?: number;
  sequenceNo?: string;
  account?: string;
  memberName?: string;
  workDate?: string;
  workStartTime?: string;
  registeredHours?: number;
  workContent?: string;
  relatedTaskName?: string;
  rawData?: UnknownMap;
  extraFields?: UnknownMap;
};

export function createExcelRow(input: SampleExcelRowInput = {}) {
  return {
    [EXCEL_HEADERS.sequenceNo]: input.sequenceNo ?? "1",
    [EXCEL_HEADERS.account]: input.account ?? "zhangsan",
    [EXCEL_HEADERS.memberName]: input.memberName ?? "张三",
    [EXCEL_HEADERS.workStartTime]:
      input.workStartTime ?? "2026-04-10 09:00:00",
    [EXCEL_HEADERS.registeredHours]: input.registeredHours ?? 7.5,
    [EXCEL_HEADERS.workContent]:
      input.workContent ?? "完成接口联调并输出联调问题清单",
    [EXCEL_HEADERS.relatedTaskName]: input.relatedTaskName ?? "接口联调",
    ...(input.extraFields ?? {})
  };
}

export function createNormalizedRecord(
  input: SampleNormalizedInput = {}
): NormalizedRecord {
  const workDate =
    input.workDate ??
    dayjs(input.workStartTime ?? "2026-04-10 09:00:00").format("YYYY-MM-DD");

  return {
    id: input.id ?? "record_sample_1",
    batchId: input.batchId ?? "batch_test",
    rawRecordId: input.rawRecordId ?? "raw_sample_1",
    rowIndex: input.rowIndex ?? 2,
    sequenceNo: input.sequenceNo ?? "1",
    account: input.account ?? "zhangsan",
    memberName: input.memberName ?? "张三",
    workDate,
    workStartTime: input.workStartTime ?? `${workDate} 09:00:00`,
    registeredHours: input.registeredHours ?? 7.5,
    workContent:
      input.workContent ?? "完成接口联调并输出联调问题清单",
    relatedTaskName: input.relatedTaskName ?? "接口联调",
    normalizedContent:
      (input.workContent ?? "完成接口联调并输出联调问题清单")
        .replace(/\s+/g, " ")
        .trim(),
    rawData:
      input.rawData ??
      createExcelRow({
        sequenceNo: input.sequenceNo ?? "1",
        account: input.account ?? "zhangsan",
        memberName: input.memberName ?? "张三",
        workStartTime: input.workStartTime ?? `${workDate} 09:00:00`,
        registeredHours: input.registeredHours ?? 7.5,
        workContent:
          input.workContent ?? "完成接口联调并输出联调问题清单",
        relatedTaskName: input.relatedTaskName ?? "接口联调"
      }),
    extraFields: input.extraFields ?? {}
  };
}

export function createRecordListItem(
  overrides: Partial<RecordListItem> = {}
): RecordListItem {
  const baseRecord = createNormalizedRecord({
    id: overrides.recordId ?? "record_export_1",
    account: overrides.account,
    memberName: overrides.memberName,
    workDate: overrides.workDate,
    registeredHours: overrides.registeredHours,
    workContent: overrides.workContent,
    relatedTaskName: overrides.relatedTaskName,
    rawData: overrides.rawData,
    extraFields: overrides.extraFields
  });

  return {
    id: overrides.id ?? "list_export_1",
    batchId: overrides.batchId ?? "batch_export",
    recordId: overrides.recordId ?? baseRecord.id,
    rowIndex: overrides.rowIndex ?? baseRecord.rowIndex,
    sequenceNo: overrides.sequenceNo ?? baseRecord.sequenceNo,
    account: overrides.account ?? baseRecord.account,
    memberName: overrides.memberName ?? baseRecord.memberName,
    workDate: overrides.workDate ?? baseRecord.workDate,
    registeredHours:
      overrides.registeredHours ?? baseRecord.registeredHours,
    workContent: overrides.workContent ?? baseRecord.workContent,
    relatedTaskName:
      overrides.relatedTaskName ?? baseRecord.relatedTaskName,
    riskLevel: overrides.riskLevel ?? "low",
    ruleRiskLevel: overrides.ruleRiskLevel ?? overrides.riskLevel ?? "low",
    aiRiskLevel: overrides.aiRiskLevel ?? null,
    finalRiskLevel:
      overrides.finalRiskLevel ??
      overrides.aiRiskLevel ??
      overrides.ruleRiskLevel ??
      overrides.riskLevel ??
      "low",
    issueCount: overrides.issueCount ?? 0,
    needAiReview: overrides.needAiReview ?? false,
    ruleFlags: overrides.ruleFlags ?? {},
    riskScores: overrides.riskScores ?? {},
    issueTitles: overrides.issueTitles ?? [],
    aiReviewed: overrides.aiReviewed ?? false,
    aiSummary: overrides.aiSummary ?? null,
    aiConfidence: overrides.aiConfidence ?? null,
    aiReviewLabel: overrides.aiReviewLabel ?? null,
    aiSuggestion: overrides.aiSuggestion ?? null,
    aiReviewReason: overrides.aiReviewReason ?? null,
    aiReviewedAt: overrides.aiReviewedAt ?? null,
    rawData: overrides.rawData ?? baseRecord.rawData,
    extraFields: overrides.extraFields ?? {}
  };
}

export const sampleRecords = {
  normal: createNormalizedRecord(),
  highHours: createNormalizedRecord({
    id: "record_high_hours",
    rawRecordId: "raw_high_hours",
    memberName: "李四",
    account: "lisi",
    registeredHours: 15,
    workContent: "完成部署并提交上线验收结果",
    relatedTaskName: "版本发布"
  }),
  shortContent: createNormalizedRecord({
    id: "record_short_content",
    rawRecordId: "raw_short_content",
    memberName: "王五",
    account: "wangwu",
    workContent: "沟通",
    relatedTaskName: "接口联调"
  }),
  management: createNormalizedRecord({
    id: "record_management",
    rawRecordId: "raw_management",
    memberName: "赵六",
    account: "zhaoliu",
    workContent: "协调推进项目计划，跟踪风险项并同步进展",
    relatedTaskName: "项目管理"
  }),
  weakMatch: createNormalizedRecord({
    id: "record_weak_match",
    rawRecordId: "raw_weak_match",
    memberName: "孙七",
    account: "sunqi",
    workContent: "整理周例会纪要并同步给相关同学",
    relatedTaskName: "性能压测"
  })
};
