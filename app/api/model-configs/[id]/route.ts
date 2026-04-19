import { NextResponse } from "next/server";

import { repositories } from "@/lib/storage/repositories";
import { maskConfig } from "@/lib/storage/model-config-repository";
import type { ModelProviderType } from "@/types/domain";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  if (provider !== undefined && !["deepseek", "glm", "custom"].includes(provider as string)) {
    return NextResponse.json(
      { error: "provider 必须为 deepseek / glm / custom 之一" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof name === "string") updates.name = name.trim();
  if (typeof provider === "string") updates.provider = provider as ModelProviderType;
  if (typeof apiKey === "string") updates.apiKey = apiKey; // empty string = keep old key
  if (typeof baseUrl === "string") updates.baseUrl = baseUrl.trim();
  if (typeof model === "string") updates.model = (model as string).trim();

  try {
    const updated = await repositories.modelConfigs.update(id, updates);
    return NextResponse.json(maskConfig(updated));
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "配置不存在" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await repositories.modelConfigs.delete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "配置不存在" }, { status: 404 });
    }
    throw error;
  }
}
