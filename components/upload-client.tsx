"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/section-card";

export function UploadClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function onFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setMessage("");
  }

  function onParseClick() {
    if (!selectedFile) return;

    startTransition(async () => {
      setMessage("正在解析文件，请稍候...");

      const formData = new FormData();
      formData.append("file", selectedFile);

      const uploadResponse = await fetch("/api/files/upload", {
        method: "POST",
        body: formData
      });

      if (!uploadResponse.ok) {
        const result = await uploadResponse.json().catch(() => ({}));
        setMessage(result.error || "上传失败，请重试。");
        return;
      }

      // 解析成功后自动触发 AI 复核
      void fetch("/api/ai/review-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" })
      });

      // 跳转到数据看板
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <SectionCard title="上传日报文件" description="选择 Excel 文件后，点击【开始解析】，系统将解析数据并自动开启 AI 复核。">
        <div className="space-y-4">
          <label className="flex min-h-40 cursor-pointer flex-col justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white/70 p-6 text-center transition hover:border-ember">
            {selectedFile ? (
              <>
                <div className="text-base font-semibold text-ink">{selectedFile.name}</div>
                <div className="text-sm text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB · 点击重新选择
                </div>
              </>
            ) : (
              <>
                <div className="text-base font-semibold text-slate-600">点击选择 Excel 文件</div>
                <div className="text-sm text-slate-400">支持 .xlsx / .xls</div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onFileSelect}
              disabled={isPending}
            />
          </label>

          <button
            type="button"
            onClick={onParseClick}
            disabled={!selectedFile || isPending}
            className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "解析中，请稍候..." : "开始解析"}
          </button>

          {message ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              {message}
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
