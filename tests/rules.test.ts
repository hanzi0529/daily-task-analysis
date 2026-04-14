import { describe, expect, it } from "vitest";

import { analyzeRecordsV2 } from "@/lib/rules/analyze-records-v2";
import {
  createNormalizedRecord,
  sampleRecords
} from "@/tests/fixtures/report-samples";

describe("规则引擎", () => {
  it("单条工时过高会命中 hours.single.high 且为 high risk", () => {
    const [result] = analyzeRecordsV2([sampleRecords.highHours]);

    expect(result.ruleFlags["hours.single.high"]).toBe(true);
    expect(result.riskLevel).toBe("high");
  });

  it("单日总工时异常会命中 hours.daily.high", () => {
    const records = [
      createNormalizedRecord({
        id: "record_daily_1",
        rawRecordId: "raw_daily_1",
        memberName: "张三",
        account: "zhangsan",
        workDate: "2026-04-12",
        workStartTime: "2026-04-12 09:00:00",
        registeredHours: 7,
        workContent: "完成功能开发并提交测试",
        relatedTaskName: "功能开发"
      }),
      createNormalizedRecord({
        id: "record_daily_2",
        rawRecordId: "raw_daily_2",
        memberName: "张三",
        account: "zhangsan",
        workDate: "2026-04-12",
        workStartTime: "2026-04-12 14:00:00",
        registeredHours: 6.5,
        workContent: "完成回归验证并确认问题关闭",
        relatedTaskName: "回归验证"
      })
    ];

    const results = analyzeRecordsV2(records);

    expect(results.every((item) => item.ruleFlags["hours.daily.high"] === true)).toBe(true);
    expect(
      results.every((item) =>
        item.issues.some((issue) => issue.ruleKey === "hours.daily.high")
      )
    ).toBe(true);
  });

  it("内容过短会命中 content.too-short", () => {
    const [result] = analyzeRecordsV2([sampleRecords.shortContent]);

    expect(result.ruleFlags["content.too-short"]).toBe(true);
  });

  it("缺少结果痕迹会命中 content.missing-result-signal", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_missing_result",
        rawRecordId: "raw_missing_result",
        workContent: "推进接口联调问题排查并同步相关同学",
        relatedTaskName: "接口联调"
      })
    ]);

    expect(result.ruleFlags["content.missing-result-signal"]).toBe(true);
    expect(result.riskLevel).toBe("low");
  });

  it("管理类任务不会被过度误判为高风险，也不会轻易触发 weak match", () => {
    const [result] = analyzeRecordsV2([sampleRecords.management]);

    expect(result.riskLevel).not.toBe("high");
    expect(result.ruleFlags["task.weak-match"]).toBeUndefined();
  });

  it("风险等级计算符合当前策略：两个 medium 会聚合为 medium", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_medium_mix",
        rawRecordId: "raw_medium_mix",
        memberName: "陈八",
        account: "chenba",
        workDate: "2026-04-12",
        workStartTime: "2026-04-12 09:00:00",
        registeredHours: 13,
        workContent: "沟通",
        relatedTaskName: "接口联调"
      })
    ]);

    expect(result.ruleFlags["hours.single.high"]).toBe(true);
    expect(result.ruleFlags["content.too-short"]).toBe(true);
    expect(result.riskLevel).toBe("medium");
  });

  it("不会新增跨多日相似描述高工时的高风险规则", () => {
    const records = [
      createNormalizedRecord({
        id: "record_cross_day_1",
        rawRecordId: "raw_cross_day_1",
        workDate: "2026-04-10",
        workStartTime: "2026-04-10 09:00:00",
        registeredHours: 8,
        workContent: "完成接口联调并输出问题清单",
        relatedTaskName: "接口联调"
      }),
      createNormalizedRecord({
        id: "record_cross_day_2",
        rawRecordId: "raw_cross_day_2",
        workDate: "2026-04-11",
        workStartTime: "2026-04-11 09:00:00",
        registeredHours: 8,
        workContent: "完成接口联调并输出问题清单",
        relatedTaskName: "接口联调"
      })
    ];

    const results = analyzeRecordsV2(records);

    expect(results.every((item) => item.issues.length === 0)).toBe(true);
    expect(
      results.every((item) =>
        item.issues.every((issue) => !issue.ruleKey.includes("multi-day"))
      )
    ).toBe(true);
  });
});
