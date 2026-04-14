import { NextResponse } from "next/server";

import { datasetIdSchema } from "@/lib/schemas/file";
import { ensureBootstrapped } from "@/lib/services/bootstrap";
import { getDashboardApiPayload } from "@/lib/services/dashboard-api-service";

export const dynamic = "force-dynamic";

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

  const data = await getDashboardApiPayload(datasetId ?? undefined);
  return NextResponse.json(data);
}
