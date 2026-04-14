import { NextResponse } from "next/server";

import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { processUploadedExcelV2 } from "@/lib/services/file-service-v2";

export async function POST(request: Request) {
  await ensureBootstrapped();

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传 Excel 文件" }, { status: 400 });
  }

  try {
    const result = await processUploadedExcelV2(file);
    return NextResponse.json({
      success: true,
      datasetId: result.batch.datasetId,
      batchId: result.batch.batchId,
      fileId: result.batch.file.id,
      fileName: result.batch.file.originalFileName,
      dashboard: result.dashboard
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "文件处理失败"
      },
      { status: 500 }
    );
  }
}
