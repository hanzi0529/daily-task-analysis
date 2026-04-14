import { NextResponse } from "next/server";

import { recordsQuerySchema } from "@/lib/schemas/api";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { getRecordListV2 } from "@/lib/services/query-service-v2";

export async function GET(request: Request) {
  await ensureBootstrapped();

  const { searchParams } = new URL(request.url);
  const parsed = recordsQuerySchema.safeParse({
    datasetId: searchParams.get("datasetId") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    memberName: searchParams.get("memberName") ?? undefined,
    riskLevel: searchParams.get("riskLevel") ?? undefined,
    needAiReview: searchParams.get("needAiReview") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "查询参数不合法" }, { status: 400 });
  }
  const data = await getRecordListV2(parsed.data.datasetId, {
    date: parsed.data.date,
    memberName: parsed.data.memberName,
    riskLevel: parsed.data.riskLevel,
    needAiReview:
      parsed.data.needAiReview == null
        ? undefined
        : parsed.data.needAiReview === "true"
  });
  return NextResponse.json({
    data,
    meta: {
      count: data.length
    }
  });
}
