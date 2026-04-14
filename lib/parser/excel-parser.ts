// @ts-nocheck
import dayjs from "dayjs";
import * as XLSX from "xlsx";

import { dailyReportSchema } from "@/lib/schemas/domain";
import { createId, getString, toNumber } from "@/lib/utils";
import type { DailyReportRecord, ParsedWorkbook, UnknownMap } from "@/types/domain";
import { findFieldKey } from "@/lib/parser/field-mapping";

export function parseExcelBuffer(params: {
  datasetId: string;
  fileId: string;
  buffer: Buffer;
}): ParsedWorkbook {
  const workbook = XLSX.read(params.buffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<UnknownMap>(firstSheet, {
    defval: "",
    raw: false
  });
  const rawHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];

  const parsedRows = rows.map((row, index) =>
    normalizeRow({
      row,
      rowIndex: index + 2
    })
  );

  return {
    datasetId: params.datasetId,
    fileId: params.fileId,
    sheetName: firstSheetName,
    parsedAt: new Date().toISOString(),
    rows: parsedRows,
    rawHeaders,
    parserMeta: {
      sheetCount: workbook.SheetNames.length,
      firstSheetName
    }
  };
}

function normalizeRow(params: {
  row: UnknownMap;
  rowIndex: number;
}): DailyReportRecord {
  const recognized: Partial<DailyReportRecord> = {};
  const extraFields: UnknownMap = {};

  for (const [rawKey, rawValue] of Object.entries(params.row)) {
    const fieldKey = findFieldKey(rawKey);
    if (!fieldKey) {
      extraFields[rawKey] = rawValue;
      continue;
    }

    switch (fieldKey) {
      case "employeeName":
      case "employeeId":
      case "taskName":
      case "taskCode":
      case "projectName":
      case "content":
      case "resultSummary":
        recognized[fieldKey] = getString(rawValue);
        break;
      case "reportDate": {
        const text = getString(rawValue);
        recognized.reportDate = dayjs(text).isValid()
          ? dayjs(text).format("YYYY-MM-DD")
          : dayjs().format("YYYY-MM-DD");
        break;
      }
      case "workHours":
        recognized.workHours = toNumber(rawValue);
        break;
      default:
        extraFields[rawKey] = rawValue;
    }
  }

  const candidate: DailyReportRecord = {
    id: createId("record"),
    employeeId: recognized.employeeId || undefined,
    employeeName: recognized.employeeName || "未识别员工",
    reportDate: recognized.reportDate || dayjs().format("YYYY-MM-DD"),
    taskName: recognized.taskName || undefined,
    taskCode: recognized.taskCode || undefined,
    projectName: recognized.projectName || undefined,
    workHours: recognized.workHours,
    content: recognized.content || "",
    resultSummary: recognized.resultSummary || undefined,
    sourceRowNumber: params.rowIndex,
    rawData: params.row,
    extraFields
  };

  return dailyReportSchema.parse(candidate);
}
