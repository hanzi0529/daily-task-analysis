import type { AnalysisResult, UnknownMap } from "@/types/domain";

export interface AIProvider {
  name: string;
  analyze(params: { result: AnalysisResult }): Promise<UnknownMap | undefined>;
}

export class OpenAIProvider implements AIProvider {
  name = "openai";

  async analyze() {
    return {
      provider: this.name,
      enabled: false,
      message: "OpenAI Provider 已预留，待补充真实模型调用。"
    };
  }
}

export class GLMProvider implements AIProvider {
  name = "glm";

  async analyze() {
    return {
      provider: this.name,
      enabled: false,
      message: "GLM Provider 已预留，待补充真实模型调用。"
    };
  }
}

export function getAIProvider(providerName = "openai"): AIProvider {
  if (providerName === "glm") {
    return new GLMProvider();
  }

  return new OpenAIProvider();
}
