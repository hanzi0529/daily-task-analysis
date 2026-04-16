import { describe, expect, it } from "vitest";

import { analyzeRecordsV2 } from "@/lib/rules/analyze-records-v2";
import { createNormalizedRecord, sampleRecords } from "@/tests/fixtures/report-samples";

describe("规则引擎", () => {
  it("单条工时偏高不再作为问题项", () => {
    const [result] = analyzeRecordsV2([sampleRecords.highHours]);

    expect(result.ruleFlags["hours.single.high"]).toBeUndefined();
    expect(result.issues.some((issue) => issue.ruleKey === "hours.single.high")).toBe(false);
  });

  it("单日总工时超过 12 小时会命中 hours.daily.high", () => {
    const records = [
      createNormalizedRecord({
        id: "record_daily_1",
        rawRecordId: "raw_daily_1",
        memberName: "张三",
        account: "zhangsan",
        workDate: "2026-04-12",
        workStartTime: "2026-04-12 09:00:00",
        registeredHours: 7,
        workContent: "完成接口开发并提交测试验证结果",
        relatedTaskName: "接口开发"
      }),
      createNormalizedRecord({
        id: "record_daily_2",
        rawRecordId: "raw_daily_2",
        memberName: "张三",
        account: "zhangsan",
        workDate: "2026-04-12",
        workStartTime: "2026-04-12 14:00:00",
        registeredHours: 5.5,
        workContent: "完成回归验证并确认问题闭环",
        relatedTaskName: "回归验证"
      })
    ];

    const results = analyzeRecordsV2(records);

    expect(results.every((item) => item.ruleFlags["hours.daily.high"] === true)).toBe(true);
    expect(results.every((item) => item.needAiReview === false)).toBe(true);
  });

  it("缺少日报内容会命中 fields.missing-core，标题为缺少日报内容", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_missing_content",
        rawRecordId: "raw_missing_content",
        workContent: "",
        relatedTaskName: "接口联调"
      })
    ]);

    expect(result.ruleFlags["fields.missing-core"]).toBe(true);
    expect(result.issues[0]?.title).toBe("缺少日报内容");
    expect(result.riskLevel).toBe("high");
    expect(result.needAiReview).toBe(false);
  });

  it("已登记工时为空或为 0 会判为高风险且不进入 AI 复核", () => {
    const missingHours = createNormalizedRecord({
        id: "record_missing_hours",
        rawRecordId: "raw_missing_hours",
        workContent: "完成接口联调并确认问题清单",
        relatedTaskName: "接口联调"
    });
    delete missingHours.registeredHours;

    const results = analyzeRecordsV2([
      missingHours,
      createNormalizedRecord({
        id: "record_zero_hours",
        rawRecordId: "raw_zero_hours",
        registeredHours: 0,
        workContent: "完成接口联调并确认问题清单",
        relatedTaskName: "接口联调"
      })
    ]);

    expect(results.every((item) => item.ruleFlags["fields.missing-core"] === true)).toBe(true);
    expect(results.every((item) => item.riskLevel === "high")).toBe(true);
    expect(results.every((item) => item.needAiReview === false)).toBe(true);
  });

  it("内容过短会命中 content.too-short", () => {
    const [result] = analyzeRecordsV2([sampleRecords.shortContent]);

    expect(result.ruleFlags["content.too-short"]).toBe(true);
  });

  it("缺少结果痕迹会命中 content.missing-result-signal，但详细描述不会误伤", () => {
    const [weak] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_missing_result",
        rawRecordId: "raw_missing_result",
        workContent: "沟通接口问题并同步同学",
        relatedTaskName: "接口联调"
      })
    ]);
    const [detailed] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_detailed_result",
        rawRecordId: "raw_detailed_result",
        workContent: "排查登录接口联调问题，分析返回码和日志，定位鉴权配置差异，并整理待验证问题清单",
        relatedTaskName: "接口联调"
      })
    ]);

    expect(weak.ruleFlags["content.missing-result-signal"]).toBe(true);
    expect(weak.riskLevel).toBe("low");
    expect(detailed.ruleFlags["content.missing-result-signal"]).toBeUndefined();
  });

  it("仅任务匹配较弱时保留语义提示，但不制造低风险", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_only_weak_match",
        rawRecordId: "raw_only_weak_match",
        workContent: "完成会议纪要整理并输出同步结果",
        relatedTaskName: "性能压测"
      })
    ]);

    expect(result.ruleFlags["task.weak-match"]).toBe(true);
    expect(result.riskLevel).toBe("normal");
  });

  it("任务匹配较弱和结果痕迹较弱同时存在，且文本有复核价值时进入 AI 复核", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_need_ai_review",
        rawRecordId: "raw_need_ai_review",
        memberName: "周九",
        account: "zhoujiu",
        workDate: "2026-04-12",
        registeredHours: 6,
        workContent: "推进培训材料整理并同步处理情况给相关同学",
        relatedTaskName: "接口联调"
      })
    ]);

    expect(result.ruleFlags["task.weak-match"]).toBe(true);
    expect(result.ruleFlags["content.missing-result-signal"]).toBe(true);
    expect(result.needAiReview).toBe(true);
  });

  it("纯数值型异常不会进入 AI 复核", () => {
    const results = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_numeric_1",
        rawRecordId: "raw_numeric_1",
        memberName: "吴十",
        account: "wushi",
        workDate: "2026-04-12",
        registeredHours: 7,
        workContent: "完成部署并提交上线结果",
        relatedTaskName: "版本发布"
      }),
      createNormalizedRecord({
        id: "record_numeric_2",
        rawRecordId: "raw_numeric_2",
        memberName: "吴十",
        account: "wushi",
        workDate: "2026-04-12",
        registeredHours: 6,
        workContent: "完成验证并确认发布结果",
        relatedTaskName: "版本发布"
      })
    ]);

    expect(results.every((item) => item.ruleFlags["hours.daily.high"] === true)).toBe(true);
    expect(results.every((item) => item.needAiReview === false)).toBe(true);
  });

  it("语义型高风险记录允许进入 AI 复核", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_semantic_high_1",
        rawRecordId: "raw_semantic_high_1",
        memberName: "郑十一",
        account: "zhengshiyi",
        workDate: "2026-04-12",
        registeredHours: 13,
        workContent: "推进培训材料整理并同步处理情况给相关同学",
        relatedTaskName: "接口联调"
      }),
      createNormalizedRecord({
        id: "record_semantic_high_2",
        rawRecordId: "raw_semantic_high_2",
        memberName: "郑十一",
        account: "zhengshiyi",
        workDate: "2026-04-12",
        registeredHours: 2.5,
        workContent: "继续推进培训材料整理并同步处理情况给相关同学",
        relatedTaskName: "接口联调"
      })
    ]);

    expect(result.riskLevel).toBe("high");
    expect(result.ruleFlags["hours.daily.high"]).toBe(true);
    expect(result.ruleFlags["content.missing-result-signal"]).toBe(true);
    expect(result.needAiReview).toBe(true);
  });

  it("管理类任务在命中明确语义边界条件时允许进入 AI 复核", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_management_ai",
        rawRecordId: "raw_management_ai",
        memberName: "钱十二",
        account: "qianshier",
        workDate: "2026-04-12",
        registeredHours: 6,
        workContent: "协调需求沟通安排并同步相关方处理情况和后续事项",
        relatedTaskName: "需求沟通"
      })
    ]);

    expect(result.ruleFlags["content.missing-result-signal"]).toBe(true);
    expect(result.needAiReview).toBe(true);
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

    expect(results.every((item) => item.issues.every((issue) => !issue.ruleKey.includes("multi-day")))).toBe(true);
  });

  it("会命中 content.generic-process 提示标签", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_generic_process",
        rawRecordId: "raw_generic_process",
        registeredHours: 8,
        workContent: "参加项目会议",
        relatedTaskName: "项目推进"
      })
    ]);

    expect(result.ruleFlags["content.generic-process"]).toBe(true);
  });

  it("会命中 content.missing-progress 提示标签", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_missing_progress",
        rawRecordId: "raw_missing_progress",
        registeredHours: 8,
        workContent: "继续推进接口开发",
        relatedTaskName: "接口开发"
      })
    ]);

    expect(result.ruleFlags["content.missing-progress"]).toBe(true);
  });

  it("会命中 content.meeting-too-generic 提示标签", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_meeting_generic",
        rawRecordId: "raw_meeting_generic",
        registeredHours: 2,
        workContent: "参与沟通会",
        relatedTaskName: "需求沟通"
      })
    ]);

    expect(result.ruleFlags["content.meeting-too-generic"]).toBe(true);
  });

  it("正常样例不会误伤表达质量标签", () => {
    const [result] = analyzeRecordsV2([
      createNormalizedRecord({
        id: "record_expression_ok",
        rawRecordId: "raw_expression_ok",
        registeredHours: 3,
        workContent: "参加评审会，确认接口改造方案，进行中60%",
        relatedTaskName: "接口改造"
      })
    ]);

    expect(result.ruleFlags["content.generic-process"]).toBeUndefined();
    expect(result.ruleFlags["content.missing-progress"]).toBeUndefined();
    expect(result.ruleFlags["content.meeting-too-generic"]).toBeUndefined();
  });
});
