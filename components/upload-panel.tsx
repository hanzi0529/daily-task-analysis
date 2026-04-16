"use client";

import { useState, useTransition } from "react";

export function UploadPanel() {
  const [message, setMessage] = useState("支持手动上传 Excel，或从固定目录读取最近文件。");
  const [isPending, startTransition] = useTransition();

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
          ? `上传完成：${result.fileName}，数据集 ${result.datasetId}`
          : result.error || "上传失败"
      );
    });
  }

  function importLatest() {
    startTransition(async () => {
      const response = await fetch("/api/files/import-latest", {
        method: "POST"
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? `已导入最近文件：${result.fileName}，数据集 ${result.datasetId}`
          : result.error || "导入失败"
      );
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex min-h-52 cursor-pointer flex-col justify-between rounded-3xl border border-dashed border-slate-300 bg-white/70 p-5 transition hover:border-ember">
        <div>
          <p className="text-lg font-semibold text-ink">手动上传 Excel</p>
          <p className="mt-2 text-sm text-slate-500">
            上传后会保存原始文件、解析标准化 JSON、执行基础规则并刷新数据看板。
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
          <p className="text-lg font-semibold text-ink">读取固定目录最近文件</p>
          <p className="mt-2 text-sm text-slate-500">
            适合后续切换为自动抓取能力。当前默认目录由 `LOCAL_SOURCE_DIR` 或
            `data/source-inbox` 控制。
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

      <div className="panel md:col-span-2 p-4 text-sm text-slate-600">{message}</div>
    </div>
  );
}
