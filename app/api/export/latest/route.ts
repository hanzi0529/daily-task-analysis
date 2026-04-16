import { NextResponse } from "next/server";

import { exportQuerySchema } from "@/lib/schemas/api";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { prepareLatestAnalysisWorkbook } from "@/lib/services/export-service-v2";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureBootstrapped();

  const { searchParams } = new URL(request.url);
  const parsed = exportQuerySchema.safeParse({
    datasetId: searchParams.get("datasetId") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "导出参数不合法" }, { status: 400 });
  }

  const result = await prepareLatestAnalysisWorkbook(parsed.data.datasetId);

  if (!result.ready || !result.buffer) {
    return NextResponse.json(
      {
        success: false,
        exportReady: false,
        message: result.message ?? "导出失败，请稍后重试。",
        progress: result.progress ?? null
      },
      { status: 500 }
    );
  }

  return new NextResponse(result.buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="daily-audit-latest.xlsx"'
    }
  });
}
