// @ts-nocheck
import * as XLSX from "xlsx";

import { exportColumns } from "@/config/app";
import { getDashboardData } from "@/lib/services/query-service";

export async function exportAnalysisWorkbook(datasetId?: string) {
  const analysis = await getDashboardData(datasetId);

  const rows = analysis.records.map((record) => {
    const recordIssues = analysis.issues.filter(
      (issue) =>
        issue.recordId === record.id || issue.relatedRecordIds?.includes(record.id)
    );
    const highestSeverity =
      recordIssues.find((issue) => issue.severity === "high")?.severity ||
      recordIssues.find((issue) => issue.severity === "medium")?.severity ||
      recordIssues.find((issue) => issue.severity === "low")?.severity ||
      "";

    return {
      employeeName: record.employeeName,
      employeeId: record.employeeId || "",
      reportDate: record.reportDate,
      taskName: record.taskName || "",
      taskCode: record.taskCode || "",
      workHours: record.workHours ?? "",
      content: record.content,
      issues: recordIssues.map((issue) => issue.title).join("；"),
      severity: highestSeverity
    };
  });

  const sheetRows = rows.map((row) =>
    exportColumns.reduce<Record<string, string | number>>((acc, column) => {
      acc[column.title] = (row[column.key as keyof typeof row] ?? "") as string | number;
      return acc;
    }, {})
  );

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "核查结果");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  });
}
