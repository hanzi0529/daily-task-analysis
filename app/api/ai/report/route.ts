import { NextResponse } from "next/server";

import { datasetIdSchema } from "@/lib/schemas/file";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { generateBatchReport } from "@/lib/services/ai-report-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureBootstrapped();

  const { searchParams } = new URL(request.url);
  const datasetId = searchParams.get("datasetId");

  if (datasetId) {
    const parsed = datasetIdSchema.safeParse({ datasetId });
    if (!parsed.success) {
      return NextResponse.json({ error: "datasetId 参数不合法" }, { status: 400 });
    }
  }

  const result = await generateBatchReport({
    datasetId: datasetId ?? undefined
  });

  return NextResponse.json(result, {
    status: result.success ? 200 : 404
  });
}
