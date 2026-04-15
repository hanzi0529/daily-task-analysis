import { NextResponse } from "next/server";

import { datasetIdSchema } from "@/lib/schemas/file";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { generateBatchReport } from "@/lib/services/ai-report-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureBootstrapped();

    const { searchParams } = new URL(request.url);
    const datasetId = searchParams.get("datasetId");

    if (datasetId) {
      const parsed = datasetIdSchema.safeParse({ datasetId });
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            skipped: true,
            reason: "provider_error",
            message: "datasetId 参数不合法",
            report: null
          },
          { status: 400 }
        );
      }
    }

    const result = await generateBatchReport({
      datasetId: datasetId ?? undefined
    });

    return NextResponse.json(result, {
      status: 200
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        skipped: true,
        reason: "provider_error",
        message: "AI总结暂时未生成，请稍后重试。",
        report: null
      },
      { status: 200 }
    );
  }
}

