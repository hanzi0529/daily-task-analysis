export const exportDetailFields = [
  { key: "sequenceNo", title: "序号" },
  { key: "account", title: "账号" },
  { key: "memberName", title: "成员姓名" },
  { key: "workDate", title: "工作日期" },
  { key: "registeredHours", title: "已登记工时（小时）" },
  { key: "relatedTaskName", title: "关联任务名称" },
  { key: "workContent", title: "工作内容描述" },
  { key: "riskLevel", title: "风险等级" },
  { key: "issueCount", title: "问题数量" },
  { key: "needAiReview", title: "NeedAiReview" },
  { key: "aiReviewed", title: "AI是否复核" },
  { key: "aiSummary", title: "AI点评" },
  { key: "aiReviewLabel", title: "AI复核标签" },
  { key: "aiConfidence", title: "AI置信度" },
  { key: "primaryIssueTypes", title: "主要问题类型" },
  { key: "ruleFlagsText", title: "规则标记" },
  { key: "riskScoresText", title: "风险分值" },
  { key: "rawDataText", title: "原始字段JSON" }
] as const;

export const exportPeopleFields = [
  { key: "memberName", title: "成员姓名" },
  { key: "recordCount", title: "日报条数" },
  { key: "totalHours", title: "总工时" },
  { key: "anomalyCount", title: "异常条数" },
  { key: "needAiReviewCount", title: "NeedAiReview次数" },
  { key: "highlights", title: "主要问题类型" },
  { key: "suggestion", title: "建议关注" }
] as const;
