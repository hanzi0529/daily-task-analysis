export interface DashboardAiReportPayload {
  success: boolean;
  skipped?: boolean;
  reason?: "rate_limited" | "provider_error" | "no_data" | "disabled" | null;
  status?: "completed" | "skipped" | "no-data";
  message?: string;
  report: null | {
    overview: string;
    majorFindings: string[];
    managementSuggestions: string[];
    reportingSummary: string;
    generatedAt?: string | null;
  };
}

export async function fetchDashboardAiReport(
  fetchImpl: typeof fetch = fetch
): Promise<DashboardAiReportPayload> {
  try {
    const response = await fetchImpl("/api/ai/report", {
      cache: "no-store"
    });
    const text = await response.text();

    if (!text) {
      return createEmptyAiReportPayload("provider_error", "AI总结暂未生成。");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return createEmptyAiReportPayload("provider_error", "AI总结暂未生成。");
    }

    if (!isAiReportPayload(payload)) {
      return createEmptyAiReportPayload("provider_error", "AI总结暂未生成。");
    }

    if (!response.ok) {
      return {
        ...payload,
        success: false,
        skipped: true,
        report: payload.report ?? null,
        message: payload.message || "AI总结暂未生成。"
      };
    }

    return payload;
  } catch {
    return createEmptyAiReportPayload("provider_error", "AI总结暂未生成。");
  }
}

function createEmptyAiReportPayload(
  reason: NonNullable<DashboardAiReportPayload["reason"]>,
  message: string
): DashboardAiReportPayload {
  return {
    success: false,
    skipped: true,
    reason,
    status: "skipped",
    message,
    report: null
  };
}

function isAiReportPayload(value: unknown): value is DashboardAiReportPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "report" in value;
}
