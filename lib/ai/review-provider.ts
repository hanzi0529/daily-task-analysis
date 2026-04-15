import { aiReviewConfig, type AiReviewProviderName } from "@/config/ai-review";

export interface AiRecordReviewInput {
  recordId: string;
  memberName: string;
  relatedTaskName?: string;
  workContent: string;
  registeredHours?: number;
  riskLevel?: "normal" | "low" | "medium" | "high";
  ruleSummary?: string;
  primaryIssueTypes?: string[];
  ruleFlags?: Record<string, unknown>;
  isManagementTask: boolean;
}

export interface AiRecordReviewResult {
  aiReviewed: boolean;
  aiSummary?: string | null;
  aiConfidence?: number | null;
  aiReviewLabel?: string | null;
  aiSuggestion?: string | null;
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
const MODEL_REQUEST_TIMEOUT_MS = 60000;
const GENTLE_LABELS = {
  concise: "描述偏简",
  resultWeak: "结果不明确",
  progressWeak: "进度表达不足",
  meetingGeneric: "会议描述泛化",
  taskWeak: "任务匹配待确认",
  reasonable: "表达基本合理"
} as const;

class MockAIReviewProvider implements AIReviewProvider {
  name: AiReviewProviderName = "mock";

  isAvailable() {
    return true;
  }

  async reviewRecord(input: AiRecordReviewInput): Promise<AiRecordReviewResult> {
    const labels = buildAdvisorySignals(input);
    const primaryLabel = labels[0] ?? GENTLE_LABELS.reasonable;
    const aiSuggestion = buildSuggestion(labels);

    return {
      aiReviewed: true,
      aiSummary: buildMockSummary(input, primaryLabel),
      aiConfidence: labels.length > 0 ? 0.82 : 0.73,
      aiReviewLabel: primaryLabel,
      aiSuggestion,
      aiReviewReason: buildMockReason(input, labels)
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
      reportingSummary: "本批次日报核查显示，整体风险可控，但存在少数人员和任务的异常集中现象。建议管理层优先关注高风险人员、高风险任务以及 needAiReview 集中的样本，通过抽样复核和任务复盘提升日报质量与管理可见性。"
    };
  }
}

class OpenAIReviewProvider implements AIReviewProvider {
  name: AiReviewProviderName = "openai";

  isAvailable() {
    return Boolean(aiReviewConfig.openai.apiKey);
  }

  async reviewRecord() {
    return unavailableReviewResult("OpenAI provider 已预留接口，当前仓库版本未启用真实模型调用。");
  }

  async generateBatchReport() {
    return emptyBatchReport();
  }
}

class GLMReviewProvider implements AIReviewProvider {
  name: AiReviewProviderName = "glm";

  isAvailable() {
    return Boolean(aiReviewConfig.glm.apiKey);
  }

  async reviewRecord(input: AiRecordReviewInput): Promise<AiRecordReviewResult> {
    if (!this.isAvailable()) {
      return unavailableReviewResult("GLM provider 未配置 API key，已跳过真实复核。");
    }

    const prompt = buildRecordReviewPrompt(input);
    const text = await callChatCompletion({
      url: aiReviewConfig.glm.baseUrl,
      apiKey: aiReviewConfig.glm.apiKey,
      model: aiReviewConfig.glm.model,
      prompt,
      temperature: 0.2,
      topP: 0.7
    });

    const parsed = parseJsonObject<{
      aiSummary?: string;
      aiReviewLabel?: string;
      aiSuggestion?: string;
      aiConfidence?: number | null;
      aiReviewReason?: string | null;
    }>(text);

    return {
      aiReviewed: true,
      aiSummary: normalizeAssistantText(parsed.aiSummary),
      aiReviewLabel: normalizeAssistantText(parsed.aiReviewLabel),
      aiSuggestion: normalizeAssistantText(parsed.aiSuggestion),
      aiConfidence: normalizeConfidence(parsed.aiConfidence),
      aiReviewReason: normalizeAssistantText(parsed.aiReviewReason)
    };
  }

  async generateBatchReport(input: BatchAiReportInput): Promise<BatchAiReportResult> {
    if (!this.isAvailable()) {
      return emptyBatchReport();
    }

    const prompt = buildBatchReportPrompt(input);
    const text = await callChatCompletion({
      url: aiReviewConfig.glm.baseUrl,
      apiKey: aiReviewConfig.glm.apiKey,
      model: aiReviewConfig.glm.model,
      prompt,
      temperature: 0.3,
      topP: 0.7
    });

    const parsed = parseJsonObject<BatchAiReportResult>(text);

    return {
      overview: normalizeAssistantText(parsed.overview) ?? "",
      majorFindings: normalizeStringArray(parsed.majorFindings),
      riskInsights: normalizeStringArray(parsed.riskInsights),
      focusPeopleSuggestions: normalizeStringArray(parsed.focusPeopleSuggestions),
      focusTaskSuggestions: normalizeStringArray(parsed.focusTaskSuggestions),
      managementSuggestions: normalizeStringArray(parsed.managementSuggestions),
      reportingSummary: normalizeAssistantText(parsed.reportingSummary) ?? ""
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

function buildRecordReviewPrompt(input: AiRecordReviewInput) {
  return [
    "你是一名日报填写质量助手。",
    "你的任务不是裁判员工工作真假，也不是判断是否敷衍，而是用中性、克制、建议式语言，解释这条日报为什么值得补充说明。",
    "必须遵守：",
    "1. 不允许使用“无效工作、敷衍、不合格、明显异常、严重问题”等强否定结论。",
    "2. 不允许否定工作真实性。",
    "3. 只围绕表达完整性、结果表达、进度表达、会议结论、任务匹配清晰度给建议。",
    "4. 输出 JSON，不要输出额外解释。",
    "5. aiReviewLabel 只从以下标签中选择一个：描述偏简、结果不明确、进度表达不足、会议描述泛化、任务匹配待确认、表达基本合理。",
    "6. aiSuggestion 必须是一句温和、可执行的补充建议。",
    "返回格式：{\"aiSummary\":string,\"aiReviewLabel\":string,\"aiSuggestion\":string,\"aiConfidence\":number,\"aiReviewReason\":string}",
    "以下是结构化输入：",
    JSON.stringify(
      {
        taskName: input.relatedTaskName ?? null,
        workContent: input.workContent,
        reportedHours: input.registeredHours ?? null,
        riskLevel: input.riskLevel ?? null,
        primaryIssueType: input.primaryIssueTypes ?? [],
        ruleSummary: input.ruleSummary ?? null,
        ruleFlags: input.ruleFlags ?? {},
        isManagementTask: input.isManagementTask
      },
      null,
      2
    )
  ].join("\n");
}

function buildBatchReportPrompt(input: BatchAiReportInput) {
  return [
    "你是一名管理汇报助手。",
    "请基于结构化数据生成面向管理者的批次级日报总结，不要重新分析每条日报，不要改变规则判断。",
    "要求：",
    "1. 语言自然、克制、可汇报。",
    "2. 重点输出整体概述、核心问题、风险洞察、重点人员建议、重点任务建议、管理建议、汇报话术。",
    "3. 不要使用攻击性或过度结论化表达。",
    "4. 输出 JSON，不要输出额外解释。",
    "返回格式：{\"overview\":string,\"majorFindings\":string[],\"riskInsights\":string[],\"focusPeopleSuggestions\":string[],\"focusTaskSuggestions\":string[],\"managementSuggestions\":string[],\"reportingSummary\":string}",
    "以下是结构化输入：",
    JSON.stringify(input, null, 2)
  ].join("\n");
}

async function callChatCompletion(params: {
  url: string;
  apiKey: string;
  model: string;
  prompt: string;
  temperature: number;
  topP: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(params.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        top_p: params.topP,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "user",
            content: params.prompt
          }
        ]
      })
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Model request timeout after ${MODEL_REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Model request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Model response is empty");
  }

  return text;
}

function buildAdvisorySignals(input: AiRecordReviewInput) {
  const flags = input.ruleFlags ?? {};
  const labels: string[] = [];

  if (flags["content.meeting-too-generic"] === true) {
    labels.push(GENTLE_LABELS.meetingGeneric);
  }
  if (flags["content.missing-progress"] === true) {
    labels.push(GENTLE_LABELS.progressWeak);
  }
  if (flags["content.missing-result-signal"] === true || flags["content.generic-process"] === true) {
    labels.push(GENTLE_LABELS.resultWeak);
  }
  if (flags["content.too-short"] === true) {
    labels.push(GENTLE_LABELS.concise);
  }
  if (flags["task.weak-match"] === true) {
    labels.push(GENTLE_LABELS.taskWeak);
  }

  return [...new Set(labels)];
}

function buildSuggestion(labels: string[]) {
  if (labels.includes(GENTLE_LABELS.meetingGeneric)) {
    return "建议补充会议主题、形成的结论或下一步行动。";
  }
  if (labels.includes(GENTLE_LABELS.progressWeak)) {
    return "建议增加当前进度、阶段状态或已完成比例说明。";
  }
  if (labels.includes(GENTLE_LABELS.resultWeak)) {
    return "建议补充本次工作形成的结果、输出物或结论。";
  }
  if (labels.includes(GENTLE_LABELS.taskWeak)) {
    return "建议补充本次工作与任务目标之间的对应关系。";
  }
  if (labels.includes(GENTLE_LABELS.concise)) {
    return "建议增加具体工作内容、结果或后续动作说明。";
  }

  return "建议保持当前写法，并适度补充结果或进度信息。";
}

function buildMockSummary(input: AiRecordReviewInput, label: string) {
  const taskName = input.relatedTaskName ? `“${input.relatedTaskName}”` : "当前任务";
  if (label === GENTLE_LABELS.reasonable) {
    return `这条日报对${taskName}的表达基本完整，已经能看出当前工作内容。`;
  }
  return `这条日报与${taskName}相关，但在表达完整性上仍有补充空间，建议进一步说明结果、进度或会议产出。`;
}

function buildMockReason(input: AiRecordReviewInput, labels: string[]) {
  if (labels.length === 0) {
    return "当前描述已经具备较清晰的任务关联和阶段表达。";
  }

  return `当前规则标签主要提示：${labels.join("、")}。AI 仅基于这些结构化信号补充解释与建议。`;
}

function unavailableReviewResult(message: string): AiRecordReviewResult {
  return {
    aiReviewed: false,
    aiSummary: null,
    aiConfidence: null,
    aiReviewLabel: null,
    aiSuggestion: null,
    aiReviewReason: message
  };
}

function emptyBatchReport(): BatchAiReportResult {
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

function normalizeAssistantText(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function normalizeConfidence(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function parseJsonObject<T>(text: string): T {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ?? text;
  return JSON.parse(candidate) as T;
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

function formatDistribution(items: Array<{ label: string; value: number }>) {
  if (items.length === 0) {
    return "当前暂无明显分层差异";
  }

  return items.map((item) => `${item.label}${item.value}条`).join("，");
}

