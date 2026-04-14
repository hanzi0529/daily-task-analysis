const FIELD_ALIASES: Record<string, string[]> = {
  employeeName: ["员工", "姓名", "员工姓名", "填报人"],
  employeeId: ["工号", "员工编号", "人员编号"],
  reportDate: ["日期", "日报日期", "填报日期", "工作日期"],
  taskName: ["任务", "任务名称", "工作项", "事项"],
  taskCode: ["任务编码", "任务编号", "需求号", "单号"],
  projectName: ["项目", "项目名称"],
  workHours: ["工时", "时长", "耗时", "投入工时"],
  content: ["日报内容", "工作内容", "内容", "描述", "完成情况"],
  resultSummary: ["结果", "产出", "完成结果", "结果说明"]
};

export function findFieldKey(header: string) {
  const normalized = header.trim().toLowerCase();

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (
      aliases.some((alias) => alias.toLowerCase() === normalized) ||
      normalized.includes(field.toLowerCase())
    ) {
      return field;
    }
  }

  return undefined;
}

export const excelFieldAliases = {
  sequenceNo: ["序号"],
  account: ["账号", "账户", "成员账号"],
  memberName: ["成员姓名", "姓名", "员工姓名", "成员"],
  workStartTime: ["工作开始时间", "开始时间", "日期", "工作日期"],
  registeredHours: ["已登记工时（小时）", "已登记工时", "工时", "登记工时"],
  workContent: ["工作内容描述", "工作内容", "日报内容", "内容描述"],
  relatedTaskName: ["关联任务名称", "任务名称", "关联任务"]
} as const;

export type CanonicalExcelField = keyof typeof excelFieldAliases;

export function mapExcelHeader(header: string) {
  const normalized = header.replace(/\s+/g, "").trim().toLowerCase();

  for (const [fieldKey, aliases] of Object.entries(excelFieldAliases)) {
    if (
      aliases.some(
        (alias) => alias.replace(/\s+/g, "").trim().toLowerCase() === normalized
      )
    ) {
      return fieldKey as CanonicalExcelField;
    }
  }

  return undefined;
}
