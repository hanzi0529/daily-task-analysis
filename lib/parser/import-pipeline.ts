import dayjs from "dayjs";
import * as XLSX from "xlsx";

import {
  importBatchSchema,
  normalizedRecordSchema,
  parsedDatasetSchema,
  rawRecordSchema,
  uploadFileMetaSchema
} from "@/lib/schemas/domain";
import { mapExcelHeader } from "@/lib/parser/field-mapping";
import { createId, getString, toNumber } from "@/lib/utils";
import type {
  ImportBatch,
  NormalizedRecord,
  ParsedDataset,
  RawRecord,
  UnknownMap,
  UploadFileMeta
} from "@/types/domain";

const PARSER_VERSION = "v2";

export function parseExcelFileToDataset(params: {
  batchId: string;
  datasetId: string;
  file: UploadFileMeta;
  buffer: Buffer;
  importMode: ImportBatch["importMode"];
}): ParsedDataset {
  const workbook = XLSX.read(params.buffer, {
    type: "buffer",
    cellDates: false,
    raw: false
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<UnknownMap>(sheet, {
    defval: "",
    raw: false
  });

  const rawRecords = rows.map((row, index) =>
    buildRawRecord({
      batchId: params.batchId,
      sheetName,
      rowIndex: index + 2,
      row
    })
  );
  const normalizedRecords = rawRecords.map((rawRecord) =>
    buildNormalizedRecord(params.batchId, rawRecord)
  );

  const batch = importBatchSchema.parse({
    batchId: params.batchId,
    datasetId: params.datasetId,
    status: "parsed",
    importMode: params.importMode,
    parserVersion: PARSER_VERSION,
    file: uploadFileMetaSchema.parse({
      ...params.file,
      batchId: params.batchId
    }),
    sheetName,
    rawHeaders: Object.keys(rows[0] ?? {}),
    totalRawRecords: rawRecords.length,
    totalNormalizedRecords: normalizedRecords.length,
    importedAt: params.file.importedAt,
    extra: {}
  });

  return parsedDatasetSchema.parse({
    datasetId: params.datasetId,
    batchId: params.batchId,
    batch,
    rawRecords,
    normalizedRecords
  });
}

function buildRawRecord(params: {
  batchId: string;
  sheetName: string;
  rowIndex: number;
  row: UnknownMap;
}): RawRecord {
  const candidate: Partial<RawRecord> = {};
  const extraFields: UnknownMap = {};

  for (const [key, value] of Object.entries(params.row)) {
    const mappedField = mapExcelHeader(key);
    if (!mappedField) {
      extraFields[key] = value;
      continue;
    }

    switch (mappedField) {
      case "sequenceNo":
        candidate.sequenceNo = typeof value === "number" ? value : getString(value);
        break;
      case "account":
      case "memberName":
      case "workStartTime":
      case "workContent":
      case "relatedTaskName":
        candidate[mappedField] = getString(value) || undefined;
        break;
      case "registeredHours":
        candidate.registeredHours = toNumber(value);
        break;
      default:
        extraFields[key] = value;
    }
  }

  return rawRecordSchema.parse({
    id: createId("raw"),
    batchId: params.batchId,
    sheetName: params.sheetName,
    rowIndex: params.rowIndex,
    sequenceNo: candidate.sequenceNo,
    account: candidate.account,
    memberName: candidate.memberName,
    workStartTime: candidate.workStartTime,
    registeredHours: candidate.registeredHours,
    workContent: candidate.workContent,
    relatedTaskName: candidate.relatedTaskName,
    rawData: params.row,
    extraFields
  });
}

function buildNormalizedRecord(batchId: string, rawRecord: RawRecord): NormalizedRecord {
  return normalizedRecordSchema.parse({
    id: createId("record"),
    batchId,
    rawRecordId: rawRecord.id,
    rowIndex: rawRecord.rowIndex,
    sequenceNo:
      rawRecord.sequenceNo == null ? undefined : String(rawRecord.sequenceNo),
    account: rawRecord.account,
    memberName: rawRecord.memberName || "未识别成员",
    workDate: normalizeDate(rawRecord.workStartTime),
    workStartTime: rawRecord.workStartTime,
    registeredHours: rawRecord.registeredHours,
    workContent: rawRecord.workContent || "",
    relatedTaskName: rawRecord.relatedTaskName,
    normalizedContent: normalizeContent(rawRecord.workContent ?? ""),
    rawData: rawRecord.rawData,
    extraFields: rawRecord.extraFields
  });
}

function normalizeDate(value?: string) {
  if (!value) {
    return dayjs().format("YYYY-MM-DD");
  }

  const direct = dayjs(value);
  if (direct.isValid()) {
    return direct.format("YYYY-MM-DD");
  }

  const excelSerial = Number(value);
  if (Number.isFinite(excelSerial)) {
    const parsed = XLSX.SSF.parse_date_code(excelSerial);
    if (parsed) {
      return dayjs(
        `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`
      ).format("YYYY-MM-DD");
    }
  }

  return dayjs().format("YYYY-MM-DD");
}

function normalizeContent(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
