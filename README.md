# 会议管理系统 V4.5（Meeting Manager）

面向高频会议场景（如高管办公室 / 总裁办）的一体化会议运营桌面应用：维护会议主数据、生成月度排程清单、调用 AI 生成排程方案、在仿 Outlook 日历中人工审核调整，最后输出预留通知与 Outlook 批量会邀脚本，并内置会议时间数据分析。

基于 `React 19 + Vite 7 + Electron 37` 构建，数据全部保存在本地（localStorage + 本地 JSON 备份），不依赖任何后端服务。

> 内置的示例会议数据均为自动生成的虚构数据，不包含任何真实信息。

## 功能模块

| 模块 | 说明 |
| --- | --- |
| 首页 | 运营总览：指标、待办、风险提醒、最近操作 |
| 会议库 | 会议主数据维护：多维筛选、拖拽排序、参会人与通讯录智能关联、备注 @ 引用其他会议、批量导入历史记录、回收站 |
| 排程 | 任务制排程工作流：准备清单 → 生成方案（Gemini / OpenAI / DeepSeek 三家 AI，可多方案对比）→ 调整与采用（周/月日历、冲突检测、拖拽移动、检查清单联动） |
| 预留通知 | 按已排程任务生成通知文案，模板库（内置 + 自定义），发送状态与审核区双向联动 |
| 会邀生成 | 选择任务与方案，一键生成 Outlook 批量草稿脚本（VBA / VBS） |
| 时间分析 | Excel 导入会议明细，KPI 看板、健康度评分、季度趋势、问题会议识别、排期建议与模拟 |
| 通讯录 | 联系人、别名、秘书与邮箱维护，缺失提醒 |
| 记录 | 全量操作审计日志 |

## V4.5 重点升级

- 首页新增会议运营流程，统一显示会议库、排程、审核、预留通知和会邀生成的推进状态
- 预留通知与会邀生成增加前置条件引导，避免在没有可用方案时展示不可操作的空界面
- 时间分析拆分为「总览 / 诊断 / 数据维护」三种工作模式，明细表按 40 条分页渲染
- 系统备份升级为完整备份，纳入时间分析数据、保存视角、分类配置和本地任务队列
- 补齐 Codex Sites 构建产物，可发布为私有站点

## 快速开始

```bash
npm install

# 浏览器开发模式
npm run dev

# 桌面端开发模式（Electron + 热更新）
npm run desktop:dev

# 打包
npm run build            # Web 构建
npm run desktop:dist     # macOS DMG
npm run desktop:win      # Windows NSIS 安装包
```

要求 Node.js 20+。

## AI 排程配置

AI 排程在 Electron 桌面端可用（浏览器模式提供降级方案）。首次使用在「排程 → 生成方案 → 连接设置」中选择服务商（Gemini / OpenAI / DeepSeek）并填入 API Key，Key 保存在本地配置目录，不会随备份导出。

## 可选：访问密码

如需在启动时加一道访问密码，创建 `.env.local`：

```bash
VITE_ENABLE_ACCESS_LOCK=true
VITE_ACCESS_PASSWORD=你的密码
```

两项都配置后生效（仅为轻量前端门禁，不是安全边界）。

## 数据与备份

- 所有业务数据保存在浏览器/桌面端的 localStorage
- 侧边栏「导出备份」可随时导出全量 JSON，「恢复备份」可整体还原
- Codex Sites 版本默认保持设备本地数据模式；不同浏览器或设备之间不会自动同步，请使用完整备份迁移
- 建议定期导出备份文件妥善保存

## 目录结构

```
src/
  components/    应用外壳、全局反馈（toast/确认弹窗）、访问门禁
  data/          会议数据模型与种子数据
  features/      八大功能模块（meetings/planner/review/reserveNotice/
                 outlookInvite/timeAnalysis/contacts/logs...）
  lib/           存储、冲突检测、频率计算等纯逻辑
  styles/        V5 设计系统（tokens/base/components + 各视图样式）
electron/        桌面端主进程：AI 任务队列、配置存储、三家模型客户端
```

## License

[MIT](./LICENSE)
