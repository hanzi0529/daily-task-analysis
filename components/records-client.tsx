"use client";

import { useEffect, useMemo, useState } from "react";

import { SectionCard } from "@/components/section-card";

interface RecordItem {
  id: string;
  workDate: string;
  memberName: string;
  account?: string;
  relatedTaskName?: string;
  registeredHours?: number;
  workContent: string;
  riskLevel: "low" | "medium" | "high";
  issueCount: number;
  needAiReview: boolean;
  primaryIssueTypes: string[];
  ruleFlags: Record<string, unknown>;
  riskScores: Record<string, unknown>;
  rawData: Record<string, unknown>;
  riskReasons: string[];
  aiReviewed: boolean;
  aiSummary?: string | null;
  aiConfidence?: number | null;
  aiReviewLabel?: string | null;
  aiReviewReason?: string | null;
}

export function RecordsClient() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [filters, setFilters] = useState({
    date: "",
    memberName: "",
    riskLevel: "",
    needAiReview: ""
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.date) params.set("date", filters.date);
    if (filters.memberName) params.set("memberName", filters.memberName);
    if (filters.riskLevel) params.set("riskLevel", filters.riskLevel);
    if (filters.needAiReview) params.set("needAiReview", filters.needAiReview);
    return params.toString();
  }, [filters]);

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      try {
        const data = await fetchRecords(queryString);
        if (active) {
          setRecords(data);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [queryString]);

  async function reloadRecords() {
    setLoading(true);
    try {
      const data = await fetchRecords(queryString);
      setRecords(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleAiSampleReview() {
    setReviewing(true);
    setReviewMessage("");

    try {
      const response = await fetch("/api/ai/review-sample", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      const result = await response.json();
      setReviewMessage(result.message || `已处理 ${result.reviewedCount || 0} 条 AI 复核样本`);
      await reloadRecords();
    } finally {
      setReviewing(false);
    }
  }

  return (
    <SectionCard title="日报明细" description="支持筛选、展开查看规则详情，并轻量展示 AI 抽样复核结果。">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="grid gap-3 md:grid-cols-4 md:flex-1">
          <input
            type="date"
            value={filters.date}
            onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          />
          <input
            type="text"
            placeholder="姓名筛选"
            value={filters.memberName}
            onChange={(event) =>
              setFilters((current) => ({ ...current, memberName: event.target.value }))
            }
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          />
          <select
            value={filters.riskLevel}
            onChange={(event) =>
              setFilters((current) => ({ ...current, riskLevel: event.target.value }))
            }
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          >
            <option value="">全部风险等级</option>
            <option value="high">高风险</option>
            <option value="medium">中风险</option>
            <option value="low">低风险</option>
          </select>
          <select
            value={filters.needAiReview}
            onChange={(event) =>
              setFilters((current) => ({ ...current, needAiReview: event.target.value }))
            }
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
          >
            <option value="">全部 AI 候选状态</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void handleAiSampleReview()}
          disabled={reviewing}
          className="rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {reviewing ? "AI复核中..." : "执行AI抽样复核"}
        </button>
      </div>

      {reviewMessage ? <div className="mb-4 text-sm text-slate-600">{reviewMessage}</div> : null}

      {loading ? (
        <div className="text-sm text-slate-500">正在加载明细...</div>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <details key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer list-none">
                <div className="grid gap-3 md:grid-cols-[110px_110px_120px_1fr_80px_90px]">
                  <div className="text-sm text-slate-600">{record.workDate}</div>
                  <div className="text-sm font-semibold text-ink">{record.memberName}</div>
                  <div className="text-sm text-slate-600">{record.account || "-"}</div>
                  <div className="text-sm text-slate-700">{record.relatedTaskName || "-"}</div>
                  <div className="text-sm text-slate-700">{record.registeredHours ?? "-"}</div>
                  <div className="text-sm text-slate-700">{record.riskLevel}</div>
                </div>
                <div className="mt-3 text-sm text-slate-700">{record.workContent || "-"}</div>
                <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                  <div>问题数量：{record.issueCount}</div>
                  <div>NeedAiReview：{record.needAiReview ? "是" : "否"}</div>
                  <div>AI已复核：{record.aiReviewed ? "是" : "否"}</div>
                  <div>主要问题类型：{record.primaryIssueTypes.join("；") || "无"}</div>
                </div>
              </summary>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <DetailBlock title="风险原因" value={record.riskReasons.join("；") || "无"} />
                <DetailBlock
                  title="AI点评"
                  value={
                    record.aiSummary
                      ? `${record.aiSummary}${record.aiReviewLabel ? `\n标签：${record.aiReviewLabel}` : ""}${typeof record.aiConfidence === "number" ? `\n置信度：${record.aiConfidence}` : ""}${record.aiReviewReason ? `\n原因：${record.aiReviewReason}` : ""}`
                      : "当前未执行 AI 抽样复核"
                  }
                  code
                />
                <DetailBlock title="Rule Flags" value={JSON.stringify(record.ruleFlags, null, 2)} code />
                <DetailBlock title="Risk Scores" value={JSON.stringify(record.riskScores, null, 2)} code />
                <DetailBlock title="Raw Data" value={JSON.stringify(record.rawData, null, 2)} code />
              </div>
            </details>
          ))}
          {records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
              当前筛选条件下暂无数据
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

async function fetchRecords(queryString: string) {
  const response = await fetch(`/api/records${queryString ? `?${queryString}` : ""}`);
  const result = await response.json();
  return result.data ?? [];
}

function DetailBlock({
  title,
  value,
  code
}: {
  title: string;
  value: string;
  code?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 text-sm font-semibold text-ink">{title}</div>
      {code ? (
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">{value}</pre>
      ) : (
        <div className="text-sm text-slate-700">{value}</div>
      )}
    </div>
  );
}
