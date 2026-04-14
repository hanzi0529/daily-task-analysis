"use client";

import { useEffect, useState } from "react";

import { SectionCard } from "@/components/section-card";

interface PersonItem {
  memberName: string;
  account?: string;
  recordCount: number;
  totalHours: number;
  anomalyCount: number;
  needAiReviewCount: number;
  riskLevel: string;
  highlights: string[];
}

export function PeopleClient() {
  const [rows, setRows] = useState<PersonItem[]>([]);

  useEffect(() => {
    fetch("/api/people")
      .then((response) => response.json())
      .then((result) => setRows(result.data ?? []));
  }, []);

  return (
    <SectionCard title="人员分析" description="页面只展示 `/api/people` 的聚合结果。">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.memberName} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-ink">{row.memberName}</div>
                <div className="text-sm text-slate-500">{row.account || "-"}</div>
              </div>
              <div className="text-sm text-slate-600">{row.riskLevel}</div>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-4">
              <div>日报数：{row.recordCount}</div>
              <div>总工时：{row.totalHours}</div>
              <div>异常数：{row.anomalyCount}</div>
              <div>NeedAiReview：{row.needAiReviewCount}</div>
            </div>
            <div className="mt-3 text-sm text-slate-600">
              主要问题：{row.highlights.join("；") || "暂无"}
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
            暂无人员分析结果
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
