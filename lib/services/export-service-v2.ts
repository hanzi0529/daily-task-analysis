import * as XLSX from "xlsx";

import { exportDetailFields, exportPeopleFields } from "@/config/exportFields";
import { getPeopleListV2, getRecordListV2 } from "@/lib/services/query-service-v2";

export async function exportLatestAnalysisWorkbook(datasetId?: string) {
  const records = await getRecordListV2(datasetId);
  const people = await getPeopleListV2(datasetId);

  const detailRows = records.map((record) => {
    const source = {
      ...record,
      aiReviewed: record.aiReviewed ? "是" : "否",
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

  XLSX.utils.book_append_sheet(workbook, detailSheet, "日报核查明细");
  XLSX.utils.book_append_sheet(workbook, peopleSheet, "人员汇总");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  });
}
