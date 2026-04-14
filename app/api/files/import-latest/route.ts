import { NextResponse } from "next/server";

import { importLatestSchema } from "@/lib/schemas/file";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { importLatestLocalExcelV2 } from "@/lib/services/file-service-v2";

export async function POST(request: Request) {
  await ensureBootstrapped();

  const body = request.headers.get("content-length")
    ? await request.json().catch(() => ({}))
    : {};
  const parsed = importLatestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数不合法" }, { status: 400 });
  }

  try {
    const result = await importLatestLocalExcelV2();
    return NextResponse.json({
      success: true,
      datasetId: result.batch.datasetId,
      batchId: result.batch.batchId,
      fileId: result.batch.file.id,
      fileName: result.batch.file.originalFileName,
      batch: result.batch,
      dashboard: result.dashboard
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入固定目录文件失败" },
      { status: 500 }
    );
  }
}
