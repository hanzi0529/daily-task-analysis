"use client";

import { useEffect, useMemo, useState } from "react";

import { SectionCard } from "@/components/section-card";

interface PersonRecordItem {
  id: string;
  workDate: string;
  relatedTaskName: string;
  workContent: string;
  riskLevel: "normal" | "low" | "medium" | "high" | string;
  riskReasons: string[];
  needAiReview: boolean;
  aiSummary?: string | null;
  aiReviewLabel?: string | null;
  aiSuggestion?: string | null;
  aiReviewReason?: string | null;
}

interface PersonItem {
  memberName: string;
  account?: string;
  recordCount: number;
  totalHours: number;
  anomalyCount: number;
  needAiReviewCount: number;
  riskLevel: "normal" | "low" | "medium" | "high" | string;
  highlights: string[];
  records: PersonRecordItem[];
}

const riskLevelText: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
  normal: "正常"
};

export function PeopleClient() {
  const [rows, setRows] = useState<PersonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    memberName: "",
    riskLevel: "",
    startDate: "",
    endDate: "",
    needAiReview: ""
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.memberName) params.set("memberName", filters.memberName);
    if (filters.riskLevel) params.set("riskLevel", filters.riskLevel);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.needAiReview) params.set("needAiReview", filters.needAiReview);
    return params.toString();
  }, [filters]);

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      try {
        const response = await fetch(`/api/people${queryString ? `?${queryString}` : ""}`, {
          cache: "no-store"
        });
        const result = await response.json();
        if (active) {
          setRows(result.data ?? []);
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

  return (
    <SectionCard title="日报分析">
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_1fr_auto]">
        <input
          value={filters.memberName}
          onChange={(event) =>
            setFilters((current) => ({ ...current, memberName: event.target.value }))
          }
          placeholder="按姓名搜索"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ink"
        />
        <select
          value={filters.riskLevel}
          onChange={(event) =>
            setFilters((current) => ({ ...current, riskLevel: event.target.value }))
          }
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ink"
        >
          <option value="">全部风险等级</option>
          <option value="high">高风险</option>
          <option value="medium">中风险</option>
          <option value="low">低风险</option>
          <option value="normal">正常</option>
        </select>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 md:col-span-2 xl:col-span-1">
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, startDate: event.target.value }))
            }
            className="flex-1 min-w-0 bg-transparent text-sm outline-none"
          />
          <span className="shrink-0 text-xs text-slate-400">至</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, endDate: event.target.value }))
            }
            className="flex-1 min-w-0 bg-transparent text-sm outline-none"
          />
        </div>
        <select
          value={filters.needAiReview}
          onChange={(event) =>
            setFilters((current) => ({ ...current, needAiReview: event.target.value }))
          }
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ink"
        >
          <option value="">AI复核状态</option>
          <option value="true">需AI复核</option>
          <option value="false">无需AI复核</option>
        </select>
        <button
          type="button"
          onClick={() => setFilters({ memberName: "", riskLevel: "", startDate: "", endDate: "", needAiReview: "" })}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 outline-none transition hover:border-ink hover:text-ink whitespace-nowrap"
        >
          重置筛选
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">正在加载日报分析...</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <details key={`${row.memberName}-${row.account || "-"}`} className="rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink">{row.memberName}</div>
                    <div className="text-sm text-slate-500">{row.account || "-"}</div>
                  </div>
                  <div className="text-sm text-slate-600">{riskLevelText[row.riskLevel] ?? row.riskLevel}</div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-4">
                  <div>日报数：{row.recordCount}</div>
                  <div>总工时：{row.totalHours}</div>
                  <div>异常数：{row.anomalyCount}</div>
                  <div>需AI复核：{row.needAiReviewCount}</div>
                </div>
                <div className="mt-3 text-sm text-slate-600">
                  主要问题：{row.highlights.join("；") || "暂无"}
                </div>
              </summary>

              <div className="mt-4 space-y-3">
                {row.records.map((record) => (
                  <div key={record.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="grid gap-4 md:grid-cols-[120px_1fr_auto] md:items-start">
                      <div className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-500">
                        {record.workDate}
                      </div>
                      <div>
                        <div className="text-base font-semibold leading-7 text-ink">
                          {record.relatedTaskName || "-"}
                        </div>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">
                        {riskLevelText[record.riskLevel] ?? record.riskLevel}
                      </div>
                    </div>
                    <div className={`mt-4 grid gap-4 ${record.needAiReview ? "lg:grid-cols-2" : ""}`}>
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-2 text-sm font-semibold text-ink">日报内容</div>
                          <div className="text-sm leading-7 text-slate-700">
                            {record.workContent || "-"}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-2 text-sm font-semibold text-ink">问题项</div>
                          <div className="text-sm leading-7 text-slate-700">
                            {record.riskReasons.join("；") || "无"}
                          </div>
                        </div>
                      </div>
                      {record.needAiReview ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-2 text-sm font-semibold text-ink">AI复核结果</div>
                          <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                            {record.aiSummary
                              ? `${record.aiSummary}${record.aiReviewLabel ? `\n标签：${record.aiReviewLabel}` : ""}${record.aiSuggestion ? `\n建议：${record.aiSuggestion}` : ""}${record.aiReviewReason ? `\n原因：${record.aiReviewReason}` : ""}`
                              : "当前尚未生成 AI 复核内容"}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
              当前筛选条件下暂无日报分析结果
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
