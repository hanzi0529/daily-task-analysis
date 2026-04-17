import * as XLSX from "xlsx";

import { exportDetailFields, exportPeopleFields } from "@/config/exportFields";
import { getAiReviewProgress } from "@/lib/services/ai-review-service";
import { getStoredBatchAiReport } from "@/lib/services/ai-report-service";
import { getPeopleListV2, getRecordListV2 } from "@/lib/services/query-service-v2";

export async function exportLatestAnalysisWorkbook(datasetId?: string) {
  const records = await getRecordListV2(datasetId);
  const people = await getPeopleListV2(datasetId);
  const batchAiReport = await getStoredBatchAiReport(datasetId);

  const detailRows = records.map((record) => {
    const hasAiContent = Boolean(
      [record.aiSummary, record.aiReviewLabel, record.aiSuggestion, record.aiReviewReason].find(
        (value) => Boolean(value)
      )
    );
    const source = {
      ...record,
      riskLevel: formatRiskLevel(record.finalRiskLevel ?? record.riskLevel),
      ruleRiskLevel: formatRiskLevel(record.ruleRiskLevel ?? record.riskLevel),
      aiRiskLevel: record.aiRiskLevel ? formatRiskLevel(record.aiRiskLevel) : "",
      needAiReview: record.needAiReview ? "是" : "否",
      aiReviewed: record.aiReviewed ? "是" : "否",
      hasAiContent: hasAiContent ? "是" : "否",
      aiReviewResult: buildAiReviewResultText(record),
      aiConfidence:
        typeof record.aiConfidence === "number" ? record.aiConfidence : "",
      primaryIssueTypes: (record.primaryIssueTypes || []).join("；"),
      ruleFlagsText: JSON.stringify(record.ruleFlags, null, 2),
      riskScoresText: JSON.stringify(record.riskScores, null, 2),
      rawDataText: JSON.stringify(record.rawData, null, 2)
    } as Record<string, unknown>;

    return exportDetailFields.reduce<Record<string, unknown>>((acc, field) => {
      acc[field.title] = source[field.key] ?? "";
      return acc;
    }, {});
  });

  const peopleRows = people.map((person) => {
    const suggestion =
      person.riskLevel === "high"
        ? "建议优先复核该成员日报与任务拆分"
        : person.needAiReviewCount > 0
          ? "建议抽样复核任务语义匹配"
          : "当前可保持常规关注";

    const source = {
      ...person,
      riskLevel: formatRiskLevel(person.riskLevel),
      highlights: person.highlights.join("；"),
      suggestion
    } as Record<string, unknown>;

    return exportPeopleFields.reduce<Record<string, unknown>>((acc, field) => {
      acc[field.title] = source[field.key] ?? "";
      return acc;
    }, {});
  });

  const workbook = XLSX.utils.book_new();
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  const peopleSheet = XLSX.utils.json_to_sheet(peopleRows);
  const aiSummarySheet = XLSX.utils.json_to_sheet(buildAiSummaryRows(batchAiReport));

  XLSX.utils.book_append_sheet(workbook, detailSheet, "日报核查明细");
  XLSX.utils.book_append_sheet(workbook, peopleSheet, "人员汇总");
  XLSX.utils.book_append_sheet(workbook, aiSummarySheet, "AI管理总结");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  });
}

function formatRiskLevel(level?: string) {
  if (level === "high") {
    return "高风险";
  }
  if (level === "medium") {
    return "中风险";
  }
  if (level === "low") {
    return "低风险";
  }
  return "正常";
}

function buildAiReviewResultText(record: {
  aiSummary?: string | null;
  aiSuggestion?: string | null;
  aiReviewReason?: string | null;
}) {
  const parts = [
    record.aiSummary ? `分析：${record.aiSummary}` : "",
    record.aiSuggestion ? `建议：${record.aiSuggestion}` : "",
    !record.aiSummary && !record.aiSuggestion && record.aiReviewReason
      ? `说明：${record.aiReviewReason}`
      : ""
  ].filter(Boolean);

  return parts.join("\n");
}

export async function prepareLatestAnalysisWorkbook(datasetId?: string) {
  const reviewProgressResult = await getAiReviewProgress(datasetId);

  const buffer = await exportLatestAnalysisWorkbook(datasetId);
  return {
    ready: true as const,
    message: null,
    progress: reviewProgressResult.progress,
    buffer
  };
}

function buildAiSummaryRows(
  report:
    | {
        overview?: string;
        majorFindings?: string[];
        managementSuggestions?: string[];
        reportingSummary?: string;
      }
    | null
) {
  if (!report) {
    return [
      { 模块: "生成状态", 内容: "当前尚未生成 AI 管理总结，可先调用 /api/ai/report。" }
    ];
  }

  return [
    { 模块: "整体概述", 内容: report.overview ?? "" },
    { 模块: "核心问题", 内容: (report.majorFindings ?? []).join("\n") },
    { 模块: "管理建议", 内容: (report.managementSuggestions ?? []).join("\n") },
    { 模块: "汇报话术", 内容: report.reportingSummary ?? "" }
  ];
}
