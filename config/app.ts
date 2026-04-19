import path from "path";

import type {
  ExportColumnConfig,
  LocalSourceOptions,
  StoragePaths,
  TableColumnConfig
} from "@/types/domain";

const rootDir = process.cwd();

export const storagePaths: StoragePaths = {
  rootDir,
  uploadsDir: path.join(rootDir, "data", "uploads"),
  parsedDir: path.join(rootDir, "data", "parsed"),
  cacheDir: path.join(rootDir, "data", "cache"),
  configDir: path.join(rootDir, "data", "config")
};

export const localSourceOptions: LocalSourceOptions = {
  directoryPath:
    process.env.LOCAL_SOURCE_DIR || path.join(rootDir, "data", "source-inbox"),
  extensions: [".xlsx", ".xls"]
};

export const reportTableColumns: TableColumnConfig[] = [
  { key: "employeeName", title: "员工" },
  { key: "reportDate", title: "日期" },
  { key: "taskName", title: "任务" },
  { key: "workHours", title: "工时" },
  { key: "content", title: "日报内容", width: "36%" }
];

export const personTableColumns: TableColumnConfig[] = [
  { key: "personName", title: "人员" },
  { key: "recordCount", title: "日报数" },
  { key: "totalHours", title: "总工时" },
  { key: "issueCount", title: "异常数" },
  { key: "riskLevel", title: "风险级别" }
];

export const exportColumns: ExportColumnConfig[] = [
  { key: "employeeName", title: "员工" },
  { key: "employeeId", title: "员工编号" },
  { key: "reportDate", title: "日报日期" },
  { key: "taskName", title: "任务名称" },
  { key: "taskCode", title: "任务编码" },
  { key: "workHours", title: "工时" },
  { key: "content", title: "日报内容" },
  { key: "issues", title: "异常标签" },
  { key: "severity", title: "最高风险等级" }
];

export const ruleThresholds = {
  minContentLength: 12,
  maxSingleRecordHours: 12,
  minSingleRecordHours: 0.5,
  maxDailyHours: 12,
  minDailyHours: 2,
  duplicateSimilarityThreshold: 0.82
};
