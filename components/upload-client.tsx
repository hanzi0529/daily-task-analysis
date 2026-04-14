"use client";

import { useEffect, useState, useTransition } from "react";

import { SectionCard } from "@/components/section-card";

export function UploadClient() {
  const [message, setMessage] = useState("支持手动上传 Excel，或从固定目录读取最近文件。");
  const [snapshot, setSnapshot] = useState<{
    summary: { fileName: string };
    metrics: { totalRecords: number; anomalyRate: number };
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/dashboard")
      .then((response) => response.json())
      .then((result) => setSnapshot(result));
  }, []);

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
          ? `上传完成：${result.fileName}，共 ${result.dashboard.totalRecords} 条记录`
          : result.error || "上传失败"
      );
    });
  }

  function importLatest() {
    startTransition(async () => {
      const response = await fetch("/api/files/import-latest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? `已导入最近文件：${result.fileName}，异常 ${result.dashboard.anomalyRecords} 条`
          : result.error || "导入失败"
      );
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex min-h-52 cursor-pointer flex-col justify-between rounded-3xl border border-dashed border-slate-300 bg-white/70 p-5 transition hover:border-ember">
          <div>
            <p className="text-lg font-semibold text-ink">手动上传 Excel</p>
            <p className="mt-2 text-sm text-slate-500">
              上传后会自动保存原始文件、完成解析、规则分析并写入缓存。
            </p>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="mt-4 block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-white"
            onChange={onUpload}
            disabled={isPending}
          />
        </label>

        <div className="flex min-h-52 flex-col justify-between rounded-3xl border border-slate-200 bg-white/70 p-5">
          <div>
            <p className="text-lg font-semibold text-ink">导入最近文件</p>
            <p className="mt-2 text-sm text-slate-500">
              服务层会从固定目录或 `data/uploads` 中读取最近的真实 Excel。
            </p>
          </div>
          <button
            type="button"
            onClick={importLatest}
            disabled={isPending}
            className="mt-4 rounded-full bg-moss px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "处理中..." : "导入最近文件"}
          </button>
        </div>
      </div>

      <div className="panel p-4 text-sm text-slate-700">{message}</div>

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
