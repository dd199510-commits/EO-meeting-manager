# Time Analysis Module

这个目录是会议时长分析的独立模块雏形。当前先挂在主应用 `#timeAnalysis` 页面里验证，后续可以整体迁入会议管理系统的正式分析模块。

## 入口

- UI 组件入口：`src/features/timeAnalysis/index.js`
- 主工作台：`TimeAnalysisWorkbench.jsx`
- 数据与字段：`timeAnalysisData.js`
- 清洗、统计、导入解析：`timeAnalysisUtils.js`

主应用当前在 `src/App.jsx` 中通过 `import { TimeAnalysisWorkbench } from './features/timeAnalysis'` 引入。

## 数据输入

模块保留仿 Excel 的输入方式，适合一次粘贴一个季度的多条会议明细。默认列：

| 字段 | 含义 |
| --- | --- |
| `date` | 日期 |
| `meetingType` | 会议类型 |
| `title` | 会议主题 |
| `locationType` | 公司/线上/外部等场景 |
| `plannedStart` | 预计开始 |
| `plannedEnd` | 预计结束 |
| `actualStart` | 实际开始 |
| `actualEnd` | 实际结束 |
| `remark` | 备注 |

派生字段由工具函数自动计算，包括季度、月份、规划时长、实际时长、差值、准时状态、星期、时段和系列名称。

## 本地状态

当前 MVP 使用浏览器 localStorage，方便单独开发验证：

- `meeting-manager:time-analysis-records:v2`
- `meeting-manager:time-analysis-filters:v1`
- `meeting-manager:time-analysis-saved-views:v1`

正式接入系统时，可以把这三类状态替换为后端接口或会议系统已有的数据层。

## 分析能力

- 总览 KPI：日程数、规划时长、实际时长、差值、准时率、平均偏差。
- 趋势分析：按季度对比数量、时长、差值率、准时率、平均偏差。
- 明细切片：季度、月份、日期、类型、地点、状态、星期、时段、关键词筛选。
- 结构分析：会议类型、地点、状态、星期、时段的占比和环比变化。
- 节奏分析：星期和时段热力图，用于发现会议拥堵区间。
- 质量分析：数据缺失、异常时长、超时/早结束分布。
- 报告辅助：生成季度摘要、切片复盘、报告就绪度和 Markdown 报告草稿。

## MVP 收敛边界

当前阶段功能范围冻结在“独立模块、空数据启动、用户自行导入”的 MVP，不再继续追加新分析模块。后续只做稳定性、明显交互问题、接入准备和必要修 bug。

MVP 内能力：

- 仿 Excel 明细录入、文件导入、撤销批量导入。
- 明细编辑、质量检查、排序、筛选、快捷切片和保存视角。
- 互动看板，包括 KPI、趋势、环比/同比基准、结构归因、节奏热力图、排行和排期模拟。
- 季度报告辅助，包括汇报叙事、汇报大纲、报告就绪度、Markdown 导出。
- 独立模块入口和验证脚本，便于后续迁入会议管理系统。

暂不继续追加：

- PPT/PDF 固定模板导出。
- 后端账号体系、团队共享和权限。
- 自动生成更多图表类型或更多报告页。
- 复杂预测模型和 AI 自动写整份报告。

收敛验收口径：

- 默认不内置会议明细，云端部署只提供程序壳。
- 能导入用户本地 Excel/CSV/TSV/TXT，并生成统计看板。
- 能通过筛选、排序、图表点击和保存视角完成季度复盘。
- 能切换环比/同比基准，并将同一基准同步到趋势、归因和报告。
- 能输出 Markdown 报告草稿，并通过报告就绪度发现缺口。
- `verify:time-analysis`、目标文件 ESLint、`npm run build` 均通过。

## 验证命令

```bash
npm run verify:time-analysis
npx eslint src/features/timeAnalysis/TimeAnalysisWorkbench.jsx src/features/timeAnalysis/timeAnalysisUtils.js src/features/timeAnalysis/timeAnalysisData.js src/features/timeAnalysis/index.js scripts/verify-time-analysis.mjs
npm run build
```

`verify:time-analysis` 使用小型内联 fixture 验证解析和统计逻辑。需要验证真实工作簿时，可以通过 `TIME_ANALYSIS_EXCEL=/path/to/file.xlsx npm run verify:time-analysis` 显式传入本地文件。

## 后续迁移清单

1. 将 `localStorage` 状态替换为会议系统的数据服务。
2. 将 Excel/CSV 导入结果写入统一会议明细表，而不是只存在浏览器本地。
3. 将保存视图和报告草稿接入用户账号或团队空间。
4. 把 `timeAnalysisUtils.js` 中的纯统计函数保留为共享服务，供看板、报告和后端任务复用。
5. 为季度报告增加固定导出模板，例如 PPT、PDF 或企业内部文档格式。
