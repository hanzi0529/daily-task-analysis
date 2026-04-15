import { NextResponse } from "next/server";

import { aiReviewSampleRequestSchema } from "@/lib/schemas/api";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { reviewSampleRecords } from "@/lib/services/ai-review-service";

export async function POST(request: Request) {
  await ensureBootstrapped();

  const body = request.headers.get("content-length")
    ? await request.json().catch(() => ({}))
    : {};
  const parsed = aiReviewSampleRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "AI 复核请求参数不合法" }, { status: 400 });
  }

  const result = await reviewSampleRecords({
    datasetId: parsed.data.datasetId,
    limit: parsed.data.limit
  });

  return NextResponse.json(result, {
    status: result.success ? 200 : 404
  });
}

