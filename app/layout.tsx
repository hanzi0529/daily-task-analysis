import type { Metadata } from "next";
import { PropsWithChildren } from "react";

import "@/app/globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "日报智能核查系统",
  description: "面向管理者的日报核查、异常识别与管理提醒平台"
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
