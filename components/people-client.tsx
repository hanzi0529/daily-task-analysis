"use client";

import { useEffect, useMemo, useState } from "react";

import { SectionCard } from "@/components/section-card";

interface PersonItem {
  memberName: string;
  account?: string;
  recordCount: number;
  totalHours: number;
  anomalyCount: number;
  needAiReviewCount: number;
  riskLevel: "normal" | "low" | "medium" | "high" | string;
  highlights: string[];
}

const riskLevelText: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
  normal: "正常"
};

export function PeopleClient() {
  const [rows, setRows] = useState<PersonItem[]>([]);
  const [nameKeyword, setNameKeyword] = useState("");

  useEffect(() => {
    fetch("/api/people", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => setRows(result.data ?? []));
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = nameKeyword.trim().toLowerCase();
    if (!keyword) {
      return rows;
    }

    return rows.filter((row) => row.memberName.toLowerCase().includes(keyword));
  }, [nameKeyword, rows]);

  return (
    <SectionCard title="人员分析" description="页面只展示 `/api/people` 的聚合结果。">
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <input
          value={nameKeyword}
          onChange={(event) => setNameKeyword(event.target.value)}
          placeholder="按姓名搜索"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ink"
        />
      </div>

      <div className="space-y-3">
        {filteredRows.map((row) => (
          <div key={row.memberName} className="rounded-2xl border border-slate-200 bg-white p-4">
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
          </div>
        ))}
        {filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
            暂无匹配的人员分析结果
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
