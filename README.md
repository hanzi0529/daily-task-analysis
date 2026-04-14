# 日报智能核查系统

基于 Next.js + TypeScript + Tailwind 的全栈项目骨架，面向管理者对员工日报 Excel 做导入、标准化、规则核查与可选 AI 增强。

## 当前能力

- 真实 Excel 导入与解析
- 标准化 JSON 输出
- 规则分析与 Dashboard 聚合
- Dashboard / 上传页 / 日报明细页 / 人员分析页全部接入真实 API
- 导出最新核查结果 Excel（2 个 sheet）
- AI 抽样复核已接入，作为可选增强，不参与主判断

## 关键目录

```text
app/
components/
config/
data/
  uploads/
  parsed/
  cache/
  source-inbox/
lib/
  ai/
  parser/
  rules/
  schemas/
  services/
  storage/
types/
```

## 统一数据结构

本项目已统一以下核心 schema 和 TypeScript 类型：

- `UploadFileMeta`
- `ImportBatch`
- `RawRecord`
- `NormalizedRecord`
- `RecordAnalysisResult`
- `RecordListItem`
- `DashboardSummary`

说明：

- 原始 Excel 字段保留在 `rawData`
- 标准化结构保留 `extraFields`
- `ruleFlags` 与 `riskScores` 支持动态 key
- AI 相关字段已支持 `aiReviewed` / `aiSummary` / `aiConfidence` / `aiReviewLabel` / `aiReviewReason` / `aiReviewedAt`
- 旧数据即使没有 AI 字段，也不会影响读取、展示和导出

## Excel 字段映射

当前从第一张表自动映射：

- `序号` -> `sequenceNo`
- `账号` -> `account`
- `成员姓名` -> `memberName`
- `工作开始时间` -> `workStartTime` / `workDate`
- `已登记工时（小时）` -> `registeredHours`
- `工作内容描述` -> `workContent`
- `关联任务名称` -> `relatedTaskName`

未识别字段不会丢失，会保留在 `rawData` 与 `extraFields` 中。

## 已实现规则

- 工时异常
  - 单条工时过高/过低
  - 单日总工时异常
- 完整性异常
  - 内容过短
  - 结果痕迹较弱
- 基础任务匹配
  - 任务匹配较弱时标记 `needAiReview`
- 重复填报
  - 同一人同一天多条描述高度相似时标记风险

未加入规则：

- “同一任务连续多日高工时但描述无明显变化：高风险”

## 启动项目

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

## 如何导入 Excel

### 方式 1：手动上传

1. 打开 `/upload`
2. 选择 `.xlsx` 或 `.xls`
3. 系统会自动：
   - 保存原始文件到 `data/uploads`
   - 解析到 `data/parsed`
   - 分析结果写入 `data/cache`

### 方式 2：导入最近文件

默认扫描目录：

```text
data/source-inbox
```

也兼容读取 `data/uploads` 中最近的 Excel，方便直接验证。

可选环境变量：

```bash
LOCAL_SOURCE_DIR=你的目录路径
```

接口触发：

```bash
curl -X POST http://localhost:3000/api/files/import-latest
```

## 如何查看 Dashboard

- 页面 `/` 为真实 Dashboard
- 顶部指标、风险分布、每日异常趋势、Top 人员、Top 任务、管理摘要全部来自 `GET /api/dashboard`
- 前端不计算核心统计指标，只做展示

## 如何导出 Excel

导出接口：

```text
GET /api/export/latest
```

导出内容：

- Sheet1：日报核查明细
- Sheet2：人员汇总

导出字段来源：

- `config/exportFields.ts`

明细 sheet 已支持附带 AI 字段：

- `AI是否复核`
- `AI点评`
- `AI复核标签`
- `AI置信度`

## 如何启用 AI 抽样复核

AI 复核默认是可关闭、限量执行的辅助层，不会改写规则主判断。

可选环境变量：

```bash
AI_REVIEW_ENABLED=true
AI_REVIEW_PROVIDER=mock
AI_REVIEW_SAMPLE_LIMIT=20
```

当前 provider 说明：

- `mock`：内置可运行，用于流程联调和结构验证
- `glm`：已预留 provider 抽象入口，当前仓库版本未接真实调用
- `openai`：已预留 provider 抽象入口，当前仓库版本未接真实调用

职责边界：

- 规则引擎仍然是主判断来源
- AI 只做少量候选记录的语义补充复核
- AI 不会直接修改 `riskLevel` / `ruleFlags` / `riskScores`
- 当前默认最多只复核前 `20` 条候选记录

调用接口：

```bash
curl -X POST http://localhost:3000/api/ai/review-sample ^
  -H "Content-Type: application/json" ^
  -d "{\"limit\":20}"
```

返回摘要字段包括：

- `success`
- `status`
- `provider`
- `reviewedCount`
- `candidateCount`
- `items`

其中 `items` 会返回单条记录级 AI 结果：

- `recordId`
- `aiSummary`
- `aiConfidence`
- `aiReviewLabel`
- `aiReviewReason`

## 如何运行测试

测试框架使用 `Vitest`，当前重点保护关键主链路，而不是追求覆盖率。

运行一次：

```bash
npm run test
```

监听模式：

```bash
npm run test:watch
```

当前测试覆盖：

- Excel 字段映射与标准化
- 规则判断与风险等级计算
- Dashboard / Records API 返回结构稳定性
- Excel 导出文件、sheet 名称与列头配置一致性
- AI 抽样候选筛选、限量、mock provider、失败兜底与 API 结构稳定性

测试样例位于：

- `tests/fixtures/report-samples.ts`

样例包含：

- 正常日报
- 工时异常日报
- 内容过短日报
- 管理类任务日报
- 弱匹配日报

## 已提供 API

- `POST /api/files/upload`
- `POST /api/files/import-latest`
- `GET /api/dashboard`
- `GET /api/records`
- `GET /api/reports`
- `GET /api/people`
- `GET /api/export/latest`
- `POST /api/ai/review-sample`

## 当前真实数据统计结果

基于当前 `data/uploads` 中的真实 Excel，最新一轮验证结果为：

- 总记录数：`485`
- 核心异常记录数：`65`
- 异常率：`13.4%`
- 高风险人员数：`11`
- NeedAiReview 数：`368`
- 总工时：`3307.7`
- 导出接口返回真实 XLSX 文件，文件头验证为 `PK 03 04`

## 验证情况

已完成：

- `npm run typecheck`
- `npm run test`
- `npm run build`
- 基于真实 Excel 的导入分析验证
- `GET /api/dashboard`
- `GET /api/records`
- `GET /api/people`
- `GET /api/export/latest`

## 说明

这一版重点是把产品做到“可展示给领导”的状态：

- 页面全部展示真实 API 数据
- Excel 导出闭环可用
- 风险口径做了轻度降噪
- AI 仍是可选增强，不作为主判断依据
