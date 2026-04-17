import { NextResponse } from "next/server";

import { peopleQuerySchema } from "@/lib/schemas/api";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { getPeopleAnalysisV2 } from "@/lib/services/query-service-v2";

export async function GET(request: Request) {
  await ensureBootstrapped();

  const { searchParams } = new URL(request.url);
  const parsed = peopleQuerySchema.safeParse({
    datasetId: searchParams.get("datasetId") ?? undefined,
    memberName: searchParams.get("memberName") ?? undefined,
    riskLevel: searchParams.get("riskLevel") ?? undefined,
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    needAiReview: searchParams.get("needAiReview") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "人员查询参数不合法" }, { status: 400 });
  }

  const data = await getPeopleAnalysisV2(parsed.data.datasetId, {
    memberName: parsed.data.memberName,
    riskLevel: parsed.data.riskLevel,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    needAiReview: parsed.data.needAiReview
  });

  return NextResponse.json({
    data,
    meta: {
      count: data.length
    }
  });
}
