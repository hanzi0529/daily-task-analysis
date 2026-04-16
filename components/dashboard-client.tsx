"use client";

import { useEffect, useMemo, useState } from "react";

import {
  EMPTY_AI_REVIEW_PROGRESS,
  fetchAiReviewProgress,
  startFullAiReview,
  type AiReviewProgressPayload
} from "@/lib/client/ai-review-client";
import {
  type DashboardAiReportPayload,
  fetchDashboardAiReport
} from "@/lib/client/fetch-dashboard-ai-report";
import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";

interface DashboardResponse {
  summary: {
    fileName: string;
    importedAt: string;
  };
  metrics: {
    totalRecords: number;
    anomalyRecords: number;
    anomalyRate: number;
    highRiskPeopleCount: number;
    needAiReviewCount: number;
    totalHours: number;
  };
  charts: {
    riskTypeDistribution: Array<{ label: string; value: number }>;
    riskLevelDistribution: Array<{ label: string; value: number }>;
    dailyAnomalyTrend: Array<{ date: string; value: number }>;
  };
  topPeople: Array<{
    memberName: string;
    recordCount: number;
    totalHours: number;
    anomalyCount: number;
    riskLevel: string;
    highlights: string[];
  }>;
  topTasks: Array<{
    taskName: string;
    riskCount: number;
    totalCount: number;
    issueTypes?: string[];
  }>;
  managementSummary: string[];
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [aiReport, setAiReport] = useState<DashboardAiReportPayload | null>(null);
  const [reviewProgress, setReviewProgress] = useState<AiReviewProgressPayload>(
    EMPTY_AI_REVIEW_PROGRESS
  );
  const [loadingAiReport, setLoadingAiReport] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [reviewingAll, setReviewingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const progressPercent = useMemo(() => {
    if (reviewProgress.totalCandidates <= 0) {
      return 100;
    }

    return Math.min(
      100,
      Math.round((reviewProgress.completedCount / reviewProgress.totalCandidates) * 100)
    );
  }, [reviewProgress]);

  useEffect(() => {
    void refreshDashboard();
    void refreshAiReport();
    void refreshProgress();
  }, []);

  useEffect(() => {
    if (!reviewingAll && reviewProgress.status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshProgress();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [reviewingAll, reviewProgress.status]);

  async function refreshDashboard() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const result = await response.json();
    setData(result);
  }

  async function refreshAiReport() {
    setLoadingAiReport(true);
    try {
      const result = await fetchDashboardAiReport();
      setAiReport(result);
    } finally {
      setLoadingAiReport(false);
    }
  }

  async function refreshProgress() {
    setLoadingProgress(true);
    try {
      const result = await fetchAiReviewProgress();
      setReviewProgress(result.progress ?? EMPTY_AI_REVIEW_PROGRESS);
      if (result.message) {
        setActionMessage(result.message);
      }
    } finally {
      setLoadingProgress(false);
    }
  }

  async function handleStartFullReview() {
    setReviewingAll(true);
    setActionMessage("AI 正在执行完整复核，请稍候...");
    const timer = window.setInterval(() => {
      void refreshProgress();
    }, 1500);

    try {
      const result = await startFullAiReview({
        force: false
      });
      setActionMessage(result.message || "AI 完整复核已执行。");
      await refreshProgress();
      await refreshAiReport();
      await refreshDashboard();
    } catch {
      setActionMessage("AI 完整复核执行失败，请稍后重试。");
    } finally {
      window.clearInterval(timer);
      setReviewingAll(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setActionMessage("");

    try {
      const response = await fetch("/api/export/latest", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionMessage(payload?.message || "导出失败，请稍后重试。");
        await refreshProgress();
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "daily-audit-latest.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setActionMessage("最新 Excel 已开始下载，文件会包含当前已完成的 AI 复核结果。");
    } finally {
      setExporting(false);
    }
  }

  if (!data) {
    return <div className="panel p-6 text-sm text-slate-500">正在加载数据看板...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="日报总条数" value={data.metrics.totalRecords} />
        <MetricCard label="异常日报数" value={data.metrics.anomalyRecords} accent="text-ember" />
        <MetricCard label="异常率" value={`${data.metrics.anomalyRate}%`} />
        <MetricCard label="高风险人员数" value={data.metrics.highRiskPeopleCount} accent="text-ember" />
        <MetricCard label="需AI复核数" value={data.metrics.needAiReviewCount} accent="text-moss" />
        <MetricCard label="总工时" value={data.metrics.totalHours} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="风险类型分布" items={data.charts.riskTypeDistribution} />
        <ChartCard title="风险等级分布" items={data.charts.riskLevelDistribution} />
        <TrendCard title="每日异常趋势" items={data.charts.dailyAnomalyTrend} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="高风险人员" description="存在至少一条高风险日报的人员。">
          <SimpleList
            scrollable
            rows={data.topPeople.map((item) => ({
              title: item.memberName,
              meta: `${item.anomalyCount} 条异常 · ${item.totalHours}h`,
              detail: item.highlights.slice(0, 3).join("；") || "暂无重点问题"
            }))}
          />
        </SectionCard>

        <SectionCard title="高风险任务" description="列出所有高风险任务，缺少日报内容或工时缺失优先展示。">
          <SimpleList
            scrollable
            rows={data.topTasks.map((item) => ({
              title: item.taskName,
              meta: `${item.riskCount} 条风险 · ${item.totalCount} 条记录`,
              detail: item.issueTypes?.length
                ? `问题类型：${item.issueTypes.join("；")}`
                : "建议结合任务上下文做抽样复核"
            }))}
          />
        </SectionCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="管理摘要" description="由规则分析服务直接返回，前端不做核心指标计算。">
          <div className="space-y-3">
            {data.managementSummary.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="数据来源与导出"
          description="可随时导出当前最新 Excel；AI 复核完成多少，导出中就体现多少。"
          action={
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleStartFullReview()}
                disabled={reviewingAll || reviewProgress.status === "running"}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reviewingAll || reviewProgress.status === "running"
                  ? "AI复核中..."
                  : (reviewProgress.pendingCount > 0 && reviewProgress.completedCount > 0) ||
                      reviewProgress.failedCount > 0
                    ? "继续复核"
                    : "开始AI复核"}
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exporting}
                className="rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting ? "导出中..." : "导出最新Excel"}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-sm text-slate-600">
            <div className="rounded-2xl bg-white p-4 break-all">文件：{data.summary.fileName || "暂无"}</div>
            <div className="rounded-2xl bg-white p-4">导入时间：{data.summary.importedAt || "暂无"}</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-ink">AI复核进度</div>
                <div className="text-xs text-slate-500">
                  {loadingProgress
                    ? "加载中..."
                    : `${reviewProgress.completedCount}/${reviewProgress.totalCandidates}`}
                </div>
              </div>
              <div className="h-2 rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-ink transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                <div>需复核总数：{reviewProgress.totalCandidates}</div>
                <div>已完成：{reviewProgress.completedCount}</div>
                <div>成功：{reviewProgress.successCount}</div>
                <div>失败：{reviewProgress.failedCount}</div>
              </div>
              <div className="mt-3 text-sm text-slate-600">
                {reviewProgress.message || "当前尚未开始 AI 完整复核。"}
              </div>
            </div>
            {actionMessage ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                {actionMessage}
              </div>
            ) : null}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="AI 管理总结" description="AI 基于结构化数据和已完成的抽样复核结果生成，不改写规则主判断。">
        {loadingAiReport ? (
          <div className="text-sm text-slate-500">正在生成 AI 管理总结...</div>
        ) : !aiReport?.report ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            {aiReport?.message || "当前尚未生成 AI 管理总结。"}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              <SummaryBlock title="整体概述" content={aiReport.report.overview} />
              <ListBlock title="核心问题" items={aiReport.report.majorFindings} emptyText="当前暂无核心问题总结。" />
              <ListBlock title="管理建议" items={aiReport.report.managementSuggestions} emptyText="当前暂无管理建议。" />
            </div>
            <SummaryBlock title="汇报话术" content={aiReport.report.reportingSummary} />
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ChartCard({
  title,
  items
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <SectionCard title={title}>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex justify-between text-sm text-slate-600">
              <span>{item.label}</span>
              <span>{item.value}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-ink"
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function TrendCard({
  title,
  items
}: {
  title: string;
  items: Array<{ date: string; value: number }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <SectionCard title={title}>
      <div className="flex min-h-44 items-end gap-3">
        {items.map((item) => (
          <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-2xl bg-ember/80"
              style={{ height: `${Math.max(16, (item.value / max) * 140)}px` }}
            />
            <div className="text-center text-xs text-slate-500">
              <div>{item.date.slice(5)}</div>
              <div>{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SimpleList({
  rows,
  scrollable = false
}: {
  rows: Array<{ title: string; meta: string; detail: string }>;
  scrollable?: boolean;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-slate-500">暂无数据</div>;
  }

  return (
    <div className={scrollable ? "max-h-[420px] space-y-3 overflow-y-auto pr-2" : "space-y-3"}>
      {rows.map((row) => (
        <div key={`${row.title}-${row.meta}`} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-ink">{row.title}</div>
            <div className="text-xs text-slate-500">{row.meta}</div>
          </div>
          <div className="mt-2 text-sm text-slate-600">{row.detail}</div>
        </div>
      ))}
    </div>
  );
}

function SummaryBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 text-sm font-semibold text-ink">{title}</div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{content || "暂无内容"}</div>
    </div>
  );
}

function ListBlock({
  title,
  items,
  emptyText
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 text-sm font-semibold text-ink">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item} className="text-sm leading-6 text-slate-700">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
