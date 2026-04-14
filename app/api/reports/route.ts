import { NextResponse } from "next/server";

import { datasetIdSchema } from "@/lib/schemas/file";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { getRecordListV2 } from "@/lib/services/query-service-v2";

export async function GET(request: Request) {
  await ensureBootstrapped();

  const { searchParams } = new URL(request.url);
  const datasetId = searchParams.get("datasetId");
  if (datasetId) {
    const parsed = datasetIdSchema.safeParse({ datasetId });
    if (!parsed.success) {
      return NextResponse.json({ error: "datasetId 不合法" }, { status: 400 });
    }
  }

  const data = await getRecordListV2(datasetId ?? undefined);
  return NextResponse.json({
    data,
    meta: {
      count: data.length
    }
  });
}
