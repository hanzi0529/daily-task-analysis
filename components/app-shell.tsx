import type { Route } from "next";
import Link from "next/link";
import { PropsWithChildren } from "react";

const navItems: Array<{ href: Route; label: string }> = [
  { href: "/", label: "数据看板" },
  { href: "/upload", label: "文件上传" },
  { href: "/reports", label: "日报明细" },
  { href: "/people", label: "人员分析" }
];

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-8">
      <header className="panel mb-6 overflow-hidden">
        <div className="flex flex-col gap-6 px-6 py-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-ember">
              Daily Audit System
            </p>
            <div>
              <h1 className="text-3xl font-bold text-ink">日报智能核查系统</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                面向管理者的 Excel 日报核查平台，聚焦异常填报、工时偏差、任务匹配与管理提醒。
              </p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-ink hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
