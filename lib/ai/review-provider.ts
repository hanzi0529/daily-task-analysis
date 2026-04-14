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

export interface AIReviewProvider {
  name: AiReviewProviderName;
  isAvailable(): boolean;
  reviewRecord(input: AiRecordReviewInput): Promise<AiRecordReviewResult>;
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
