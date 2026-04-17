import { NextResponse } from "next/server";

import { aiReviewAllRequestSchema } from "@/lib/schemas/api";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { startAiReviewAllInBackground } from "@/lib/services/ai-review-service";

export async function POST(request: Request) {
  await ensureBootstrapped();

  const body = await request.json().catch(() => ({}));
  const parsed = aiReviewAllRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "AI 完整复核请求参数不合法" }, { status: 400 });
  }

  const result = await startAiReviewAllInBackground({
    datasetId: parsed.data.datasetId,
    force: parsed.data.force,
    action: parsed.data.action
  });

  return NextResponse.json(result, {
    status: result.status === "started" ? 202 : 200
  });
}
