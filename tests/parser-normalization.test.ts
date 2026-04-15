import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { parseExcelFileToDataset } from "@/lib/parser/import-pipeline";
import { createExcelRow } from "@/tests/fixtures/report-samples";

function createWorkbookBuffer(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "日报");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("Excel 字段映射与标准化", () => {
  it("可以把一行 Excel 数据映射成 RawRecord，并保留 rawData 与未识别字段", () => {
    const row = createExcelRow({
      sequenceNo: "12",
      account: "u1001",
      memberName: "测试成员",
      workStartTime: "2026-04-11 09:30:00",
      registeredHours: "8.5",
      workContent: "完成接口联调并输出问题清单",
      relatedTaskName: "接口联调",
      extraFields: {
        所属小组: "一组",
        备注信息: "原始扩展字段"
      }
    });

    const dataset = parseExcelFileToDataset({
      batchId: "batch_parser_test",
      datasetId: "dataset_parser_test",
      importMode: "upload",
      file: {
        id: "file_parser_test",
        originalFileName: "parser.xlsx",
        storedFileName: "parser.xlsx",
        storedFilePath: "data/uploads/parser.xlsx",
        sizeBytes: 128,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sourceType: "upload",
        importedAt: "2026-04-13T08:00:00.000Z",
        extra: {}
      },
      buffer: createWorkbookBuffer([row])
    });

    expect(dataset.rawRecords).toHaveLength(1);
    expect(dataset.normalizedRecords).toHaveLength(1);
    expect(dataset.datasetId).toBe("dataset_parser_test");
    expect(dataset.batchId).toBe("batch_parser_test");

    const rawRecord = dataset.rawRecords[0];
    const normalizedRecord = dataset.normalizedRecords[0];

    expect(rawRecord.sequenceNo).toBe("12");
    expect(rawRecord.account).toBe("u1001");
    expect(rawRecord.memberName).toBe("测试成员");
    expect(rawRecord.workStartTime).toBe("2026-04-11 09:30:00");
    expect(rawRecord.registeredHours).toBe(8.5);
    expect(rawRecord.workContent).toBe("完成接口联调并输出问题清单");
    expect(rawRecord.relatedTaskName).toBe("接口联调");

    expect(rawRecord.rawData).toMatchObject({
      所属小组: "一组",
      备注信息: "原始扩展字段"
    });
    expect(rawRecord.extraFields).toMatchObject({
      所属小组: "一组",
      备注信息: "原始扩展字段"
    });

    expect(normalizedRecord.sequenceNo).toBe("12");
    expect(normalizedRecord.account).toBe("u1001");
    expect(normalizedRecord.memberName).toBe("测试成员");
    expect(normalizedRecord.workDate).toBe("2026-04-11");
    expect(normalizedRecord.registeredHours).toBe(8.5);
    expect(normalizedRecord.workContent).toBe("完成接口联调并输出问题清单");
    expect(normalizedRecord.relatedTaskName).toBe("接口联调");
    expect(normalizedRecord.rawData).toMatchObject(rawRecord.rawData);
    expect(normalizedRecord.extraFields).toMatchObject({
      所属小组: "一组",
      备注信息: "原始扩展字段"
    });
  });
});
