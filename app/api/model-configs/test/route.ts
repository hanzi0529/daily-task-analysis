import { NextResponse } from "next/server";

const TEST_TIMEOUT_MS = 15000;

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

  const { apiKey, baseUrl, model } = body as Record<string, unknown>;

  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "apiKey 不能为空" }, { status: 400 });
  }
  if (!baseUrl || typeof baseUrl !== "string" || !baseUrl.trim()) {
    return NextResponse.json({ error: "baseUrl 不能为空" }, { status: 400 });
  }
  if (!model || typeof model !== "string" || !model.trim()) {
    return NextResponse.json({ error: "model 不能为空" }, { status: 400 });
  }

  const url = `${(baseUrl as string).trim()}/chat/completions`;
  const startedAt = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(apiKey as string).trim()}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: (model as string).trim(),
        max_tokens: 5,
        messages: [{ role: "user", content: "回复 ok" }]
      })
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return NextResponse.json({
        success: false,
        latencyMs,
        error: `${response.status} ${errorText.slice(0, 200)}`
      });
    }

    return NextResponse.json({ success: true, latencyMs });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({
        success: false,
        latencyMs,
        error: `连接超时（${TEST_TIMEOUT_MS / 1000}s）`
      });
    }
    return NextResponse.json({
      success: false,
      latencyMs,
      error: error instanceof Error ? error.message : "连接失败"
    });
  } finally {
    clearTimeout(timeout);
  }
}
