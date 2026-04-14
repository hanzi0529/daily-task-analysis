"use client";

import { useEffect, useState } from "react";

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
  }>;
  managementSummary: string[];
}

interface AiReportResponse {
  success: boolean;
  status: "completed" | "skipped" | "no-data";
  message?: string;
  report: null | {
    overview: string;
    majorFindings: string[];
    managementSuggestions: string[];
    reportingSummary: string;
    generatedAt?: string | null;
  };
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [aiReport, setAiReport] = useState<AiReportResponse | null>(null);
  const [loadingAiReport, setLoadingAiReport] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((response) => response.json())
      .then((result) => setData(result));

    fetch("/api/ai/report")
      .then((response) => response.json())
      .then((result) => setAiReport(result))
      .finally(() => setLoadingAiReport(false));
  }, []);

  if (!data) {
    return <div className="panel p-6 text-sm text-slate-500">正在加载 Dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="日报总条数" value={data.metrics.totalRecords} />
        <MetricCard label="异常日报数" value={data.metrics.anomalyRecords} accent="text-ember" />
        <MetricCard label="异常率" value={`${data.metrics.anomalyRate}%`} />
        <MetricCard label="高风险人员数" value={data.metrics.highRiskPeopleCount} accent="text-ember" />
        <MetricCard label="NeedAiReview 数" value={data.metrics.needAiReviewCount} accent="text-moss" />
        <MetricCard label="总工时" value={data.metrics.totalHours} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="风险类型分布" items={data.charts.riskTypeDistribution} />
        <ChartCard title="风险等级分布" items={data.charts.riskLevelDistribution} />
        <TrendCard title="每日异常趋势" items={data.charts.dailyAnomalyTrend} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="高风险人员 Top 10" description="按风险等级和异常数量排序。">
          <SimpleList
            rows={data.topPeople.map((item) => ({
              title: item.memberName,
              meta: `${item.anomalyCount} 条异常 · ${item.totalHours}h`,
              detail: item.highlights.slice(0, 3).join("；") || "暂无重点问题"
            }))}
          />
        </SectionCard>

        <SectionCard title="高风险任务 Top 10" description="按风险条数排序。">
          <SimpleList
            rows={data.topTasks.map((item) => ({
              title: item.taskName,
              meta: `${item.riskCount} 条风险 · ${item.totalCount} 条记录`,
              detail: "建议结合任务上下文做抽样复核"
            }))}
          />
        </SectionCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <SectionCard title="管理摘要" description="由规则分析服务直接返回，前端不做核心指标计算。">
          <div className="space-y-3">
            {data.managementSummary.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="数据来源"
          description="页面只负责展示和导出交互。"
          action={
            <a
              href="/api/export/latest"
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
            >
              导出最新 Excel
            </a>
          }
        >
          <div className="space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl bg-white p-4">文件：{data.summary.fileName || "暂无"}</div>
            <div className="rounded-2xl bg-white p-4">导入时间：{data.summary.importedAt || "暂无"}</div>
            <div className="rounded-2xl bg-white p-4">数据全部来自 `/api/dashboard` 与 `/api/ai/report`。</div>
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
  rows
}: {
  rows: Array<{ title: string; meta: string; detail: string }>;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-slate-500">暂无数据</div>;
  }

  return (
    <div className="space-y-3">
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
