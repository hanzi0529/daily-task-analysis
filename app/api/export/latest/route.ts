import { NextResponse } from "next/server";

import { exportQuerySchema } from "@/lib/schemas/api";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { exportLatestAnalysisWorkbook } from "@/lib/services/export-service-v2";

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

  const buffer = await exportLatestAnalysisWorkbook(parsed.data.datasetId);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="daily-audit-latest.xlsx"'
    }
  });
}
