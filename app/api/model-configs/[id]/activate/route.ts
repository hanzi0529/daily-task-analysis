import { NextResponse } from "next/server";

import { repositories } from "@/lib/storage/repositories";
import { isAnyReviewJobRunning } from "@/lib/services/ai-review-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isAnyReviewJobRunning()) {
    return NextResponse.json(
      { error: "当前有运行中的复核任务，请先停止再切换模型" },
      { status: 409 }
    );
  }

  try {
    await repositories.modelConfigs.setActive(id);
    return NextResponse.json({ success: true, activeConfigId: id });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "配置不存在" }, { status: 404 });
    }
    throw error;
  }
}
