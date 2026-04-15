"use client";

import { useEffect, useState, useTransition } from "react";

import { SectionCard } from "@/components/section-card";

export function UploadClient() {
  const [message, setMessage] = useState("支持手动上传 Excel。上传完成后，系统会自动解析并生成最新数据。");
  const [snapshot, setSnapshot] = useState<{
    summary: { fileName: string };
    metrics: { totalRecords: number; anomalyRate: number };
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void refreshSnapshot();
  }, []);

  async function refreshSnapshot() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const result = await response.json();
    setSnapshot(result);
  }

  function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? `上传完成：${result.fileName}，共 ${result.dashboard.totalRecords} 条记录。`
          : result.error || "上传失败"
      );
      await refreshSnapshot();
    });
  }

  return (
    <div className="space-y-6">
      <label className="flex min-h-52 cursor-pointer flex-col justify-between rounded-3xl border border-dashed border-slate-300 bg-white/70 p-6 transition hover:border-ember">
        <div>
          <p className="text-lg font-semibold text-ink">手动上传 Excel</p>
          <p className="mt-2 text-sm text-slate-500">
            上传后会自动保存原始文件、完成解析、执行规则分析并写入缓存。最新上传的文件会成为当前解析数据源。
          </p>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="mt-6 block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-white"
          onChange={onUpload}
          disabled={isPending}
        />
      </label>

      <div className="panel p-4 text-sm text-slate-700">{isPending ? "正在处理 Excel，请稍候..." : message}</div>

      <SectionCard
        title="当前最新数据"
        description="由真实 API 返回，页面不直接读取本地文件。"
        action={
          <a
            href="/api/export/latest"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            导出最新 Excel
          </a>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
            文件：{snapshot?.summary.fileName || "暂无"}
          </div>
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
            记录数：{snapshot?.metrics.totalRecords ?? 0}
          </div>
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
            异常率：{snapshot?.metrics.anomalyRate ?? 0}%
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
