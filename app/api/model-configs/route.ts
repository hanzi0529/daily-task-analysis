import { NextResponse } from "next/server";

import { repositories } from "@/lib/storage/repositories";
import { maskConfig } from "@/lib/storage/model-config-repository";
import type { ModelProviderType } from "@/types/domain";

export async function GET() {
  const result = await repositories.modelConfigs.getAll();
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式不合法" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体不能为空" }, { status: 400 });
  }

  const { name, provider, apiKey, baseUrl, model } = body as Record<string, unknown>;

  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "apiKey 不能为空" }, { status: 400 });
  }
  if (!baseUrl || typeof baseUrl !== "string" || !baseUrl.trim()) {
    return NextResponse.json({ error: "baseUrl 不能为空" }, { status: 400 });
  }
  if (!model || typeof model !== "string" || !model.trim()) {
    return NextResponse.json({ error: "model 不能为空" }, { status: 400 });
  }
  if (!provider || !["deepseek", "glm", "custom"].includes(provider as string)) {
    return NextResponse.json(
      { error: "provider 必须为 deepseek / glm / custom 之一" },
      { status: 400 }
    );
  }

  const resolvedName =
    typeof name === "string" && name.trim()
      ? name.trim()
      : `${provider} / ${model}`;

  const created = await repositories.modelConfigs.create({
    name: resolvedName,
    provider: provider as ModelProviderType,
    apiKey: apiKey.trim(),
    baseUrl: baseUrl.trim(),
    model: (model as string).trim()
  });

  return NextResponse.json(maskConfig(created), { status: 201 });
}
