import type { AiReviewProviderName } from "@/config/ai-review";

export interface AiRecordReviewInput {
  recordId: string;
  memberName: string;
  relatedTaskName?: string;
  workContent: string;
  registeredHours?: number;
  ruleSummary?: string;
  primaryIssueTypes?: string[];
  isManagementTask: boolean;
}

export interface AiRecordReviewResult {
  aiReviewed: boolean;
  aiSummary?: string | null;
  aiConfidence?: number | null;
  aiReviewLabel?: string | null;
  aiReviewReason?: string | null;
}

export interface BatchAiReportInput {
  metrics: {
    totalRecords: number;
    anomalyRecords: number;
    anomalyRate: number;
    highRiskPeopleCount: number;
    needAiReviewCount: number;
    totalHours: number;
  };
  riskLevelDistribution: Array<{ label: string; value: number }>;
  riskTypeDistribution: Array<{ label: string; value: number }>;
  topPeople: Array<{
    memberName: string;
    anomalyCount: number;
    riskLevel: string;
    highlights: string[];
  }>;
  topTasks: Array<{
    taskName: string;
    riskCount: number;
    totalCount: number;
  }>;
  aiReviewSummary: {
    reviewedCount: number;
    labelDistribution: Array<{ label: string; value: number }>;
    examples: string[];
  };
}

export interface BatchAiReportResult {
  overview: string;
  majorFindings: string[];
  riskInsights: string[];
  focusPeopleSuggestions: string[];
  focusTaskSuggestions: string[];
  managementSuggestions: string[];
  reportingSummary: string;
}

export interface AIReviewProvider {
  name: AiReviewProviderName;
  isAvailable(): boolean;
  reviewRecord(input: AiRecordReviewInput): Promise<AiRecordReviewResult>;
  generateBatchReport(input: BatchAiReportInput): Promise<BatchAiReportResult>;
}

const RESULT_HINTS = ["完成", "输出", "提交", "解决", "修复", "确认", "闭环", "上线", "验收"];

class MockAIReviewProvider implements AIReviewProvider {
  name: AiReviewProviderName = "mock";

  isAvailable() {
    return true;
  }

  async reviewRecord(input: AiRecordReviewInput): Promise<AiRecordReviewResult> {
    const content = normalizeText(input.workContent);
    const taskName = normalizeText(input.relatedTaskName ?? "");
    const taskTokens = taskName
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
    const matchedTokenCount = taskTokens.filter((token) => content.includes(token)).length;
    const hasProgress = RESULT_HINTS.some((token) => content.includes(token));
    const taskRelated =
      input.isManagementTask ||
      taskTokens.length === 0 ||
      matchedTokenCount > 0 ||
      simpleContainsSimilarity(taskName, content) >= 0.3;

    let aiReviewLabel = "需要补充上下文";
    let aiReviewReason = "语义可读，但任务关联或阶段结果表述仍然偏弱。";
    let aiConfidence = 0.66;

    if (taskRelated && hasProgress) {
      aiReviewLabel = "任务相关且有进展";
      aiReviewReason = "从文本看，这条日报与任务目标相关，并体现了阶段结果或可验证进展。";
      aiConfidence = 0.86;
    } else if (taskRelated) {
      aiReviewLabel = "任务相关但结果较弱";
      aiReviewReason = "内容与任务基本相关，但结果痕迹不够明确，建议补充输出或结论。";
      aiConfidence = 0.76;
    } else if (input.isManagementTask) {
      aiReviewLabel = "管理推进类记录";
      aiReviewReason = "该记录更像项目推进或协调过程，建议结合上下文人工抽样复核。";
      aiConfidence = 0.72;
    }

    return {
      aiReviewed: true,
      aiSummary: `${aiReviewLabel}：${buildNaturalSummary(input, taskRelated, hasProgress)}`,
      aiConfidence,
      aiReviewLabel,
      aiReviewReason
    };
  }

  async generateBatchReport(input: BatchAiReportInput): Promise<BatchAiReportResult> {
    const topPeopleText =
      input.topPeople[0]?.memberName != null
        ? `${input.topPeople[0].memberName} 等人员的异常更集中`
        : "当前未识别出明显集中的异常人员";
    const topTaskText =
      input.topTasks[0]?.taskName != null
        ? `${input.topTasks[0].taskName} 是当前需要重点复核的任务方向`
        : "当前未识别出明显集中的异常任务";
    const aiReviewText =
      input.aiReviewSummary.reviewedCount > 0
        ? `AI 已抽样复核 ${input.aiReviewSummary.reviewedCount} 条候选记录，主要标签集中在 ${
            input.aiReviewSummary.labelDistribution[0]?.label ?? "任务相关性与结果表达"
          }。`
        : "当前尚未形成可参考的 AI 抽样复核样本。";

    return {
      overview: `本批次共分析 ${input.metrics.totalRecords} 条日报，其中 ${input.metrics.anomalyRecords} 条进入核心异常口径，异常率为 ${input.metrics.anomalyRate}%。整体上看，风险主要集中在少数人员和少数任务场景，适合采用“重点抽样复核 + 管理跟进”的方式处理。`,
      majorFindings: [
        `异常记录 ${input.metrics.anomalyRecords} 条，高风险人员 ${input.metrics.highRiskPeopleCount} 人，说明当前问题更偏向局部集中而不是整体失控。`,
        `${topPeopleText}，建议优先结合任务拆分和日报样本做二次核查。`,
        `${topTaskText}，建议结合任务上下文确认是否存在描述不充分或工时填报偏差。`
      ],
      riskInsights: [
        `风险等级分布显示，${formatDistribution(input.riskLevelDistribution)}。`,
        input.riskTypeDistribution.length > 0
          ? `主要风险类型集中在 ${input.riskTypeDistribution
              .slice(0, 3)
              .map((item) => `${item.label}(${item.value})`)
              .join("、")}。`
          : "当前风险类型分布数据较少，建议结合后续导入批次持续观察。",
        aiReviewText
      ],
      focusPeopleSuggestions: input.topPeople.slice(0, 3).map((item) => {
        const highlightText = item.highlights.slice(0, 2).join("、") || "问题类型较分散";
        return `建议关注 ${item.memberName}：当前异常 ${item.anomalyCount} 条，主要涉及 ${highlightText}。`;
      }),
      focusTaskSuggestions: input.topTasks.slice(0, 3).map((item) => {
        return `建议关注任务“${item.taskName}”：风险记录 ${item.riskCount} 条，占该任务记录 ${item.totalCount} 条中的较高比例。`;
      }),
      managementSuggestions: [
        "先聚焦高风险人员和高风险任务做定向复核，不建议平均分散管理精力。",
        "对 needAiReview 较多的记录，可继续采用抽样复核方式确认语义匹配和结果表达是否充分。",
        "对管理推进类任务，建议补充阶段结果、输出物或闭环结论，降低后续误判与解释成本。"
      ],
      reportingSummary: `本批次日报核查显示，整体风险可控，但存在少数人员和任务的异常集中现象。建议管理层优先关注高风险人员、高风险任务以及 needAiReview 集中的样本，通过抽样复核和任务复盘提升日报质量与管理可见性。`
    };
  }
}

class OpenAIReviewProvider implements AIReviewProvider {
  name: AiReviewProviderName = "openai";

  isAvailable() {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async reviewRecord() {
    return {
      aiReviewed: false,
      aiSummary: null,
      aiConfidence: null,
      aiReviewLabel: null,
      aiReviewReason: "OpenAI provider 已预留接口，当前仓库版本未启用真实模型调用。"
    };
  }

  async generateBatchReport() {
    return {
      overview: "",
      majorFindings: [],
      riskInsights: [],
      focusPeopleSuggestions: [],
      focusTaskSuggestions: [],
      managementSuggestions: [],
      reportingSummary: ""
    };
  }
}

class GLMReviewProvider implements AIReviewProvider {
  name: AiReviewProviderName = "glm";

  isAvailable() {
    return Boolean(process.env.GLM_API_KEY);
  }

  async reviewRecord() {
    return {
      aiReviewed: false,
      aiSummary: null,
      aiConfidence: null,
      aiReviewLabel: null,
      aiReviewReason: "GLM provider 已预留接口，当前仓库版本未启用真实模型调用。"
    };
  }

  async generateBatchReport() {
    return {
      overview: "",
      majorFindings: [],
      riskInsights: [],
      focusPeopleSuggestions: [],
      focusTaskSuggestions: [],
      managementSuggestions: [],
      reportingSummary: ""
    };
  }
}

export function getAIReviewProvider(
  providerName: AiReviewProviderName = "mock"
): AIReviewProvider {
  if (providerName === "glm") {
    return new GLMReviewProvider();
  }

  if (providerName === "openai") {
    return new OpenAIReviewProvider();
  }

  return new MockAIReviewProvider();
}

function normalizeText(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
}

function simpleContainsSimilarity(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }

  const leftTokens = left.split(" ").filter((token) => token.length >= 2);
  if (leftTokens.length === 0) {
    return 0;
  }

  const hitCount = leftTokens.filter((token) => right.includes(token)).length;
  return hitCount / leftTokens.length;
}

function buildNaturalSummary(
  input: AiRecordReviewInput,
  taskRelated: boolean,
  hasProgress: boolean
) {
  const taskPart = input.relatedTaskName
    ? `任务“${input.relatedTaskName}”`
    : "当前任务";
  const relatedPart = taskRelated ? "语义关联较明确" : "语义关联偏弱";
  const progressPart = hasProgress ? "能看到阶段性进展" : "结果痕迹仍不够明确";

  return `${taskPart}${relatedPart}，${progressPart}。`;
}

function formatDistribution(items: Array<{ label: string; value: number }>) {
  if (items.length === 0) {
    return "当前暂无明显分层差异";
  }

  return items
    .map((item) => `${item.label}${item.value}条`)
    .join("，");
}
