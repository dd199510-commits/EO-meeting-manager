# 会议管理系统 — Claude Code 上下文

项目根目录：`/Users/ddss/Documents/会议管理系统-pages-clean`
当前版本：V4.0（UI 层重构中，逻辑层保持稳定）

## 样式架构（V5 设计系统）

新样式统一放在 `src/styles/`，在 `App.jsx` 中于 `App.css` 之后引入（覆盖生效）：

- `tokens.css` — 设计令牌（颜色/圆角/阴影/动效/字号），命名空间 `--nx-*`，唯一样式变量来源
- `base.css` — 焦点环、滚动条、动效偏好等基础层
- `components.css` — 通用组件类：`nx-btn`（primary/outline/quiet/danger）、`nx-card`、`nx-row`/`nx-rows`（分隔线列表）、`nx-dot`（状态点）、`nx-badge`、`nx-input`、`nx-table`、`nx-field`、`nx-empty`
- `shell.css` — 侧边栏（`nx-sidebar-*`）与页头覆盖
- `home.css` — 首页（`hv-*` 类）
- `views.css` — 通讯录（`cv-*`）、记录页（`lv-*`）
- `meetings.css` — 会议库（`mv-*`）：视口内固定高度三栏（导航/列表/详情），仅列表内部滚动
- `planner.css` — 排程模块过渡优化：日历（周/月）容器内滚动+表头吸附、检查清单侧栏吸附、步骤条/候选方案卡样式、面包屑+任务切换器+任务卡三步进度；ReviewBoard 内置最早会议自动定位
- `boards.css` — 预留通知/会邀生成/时间分析版式统一：概览卡、任务选择器、筛选芯片、列表内部滚动、预览面板吸附、数据表格吸附表头
- `feedback.css` — 全局 toast 与确认弹窗样式

## 全局反馈体系

`src/components/Feedback.jsx`：模块级 API（无需 context），任何文件 `import { toast, confirmDialog } from '.../components/Feedback'`。
App.jsx 根部挂载 `<FeedbackHost />`。全站已无 window.alert/confirm（Feedback 内保留一处降级兜底）。
危险操作（删联系人/清空日志/彻底删除/覆盖恢复/删任务/删方案）均有 danger 确认；关键操作有成功 toast。
hash 路由已双向同步（pushState + hashchange/popstate）；所有弹窗支持 Esc 与遮罩关闭，EditModal/BatchImport 有脏数据放弃确认。
- `bridge.css` — 过渡层：让未重建的重型模块（会议库/排程/审核/通知/会邀/时间分析）观感与新体系一致；模块重建后删除对应规则

`App.css`（约 2 万行）为遗留样式，仅重型模块仍依赖；新代码一律使用 `nx-*` 体系，不要往 App.css 加新规则。

## 已重建（新类名，App.css 中对应旧规则已成死代码）

- `src/components/AppSidebar.jsx` — `nx-sidebar-*`；备份下拉已改为两个直达按钮
- `src/features/home/HomeView.jsx` — `hv-*` + `nx-*`
- `src/features/contacts/ContactsView.jsx` — `cv-*` + `nx-*`
- `src/features/logs/LogsView.jsx` — `lv-*` + `nx-*`
- `src/features/meetings/MeetingsView.jsx` — `mv-*` + `nx-*`；工具栏并入列表面板头部，已删除失效的分组折叠逻辑；页头全局减薄（58px）也在此次完成；编辑统一走 EditModal 弹窗（与新建一致），InlineEditPanel.jsx 已删除，右栏为纯详情展示

## 待重建（仍用遗留类名 + bridge/planner/boards 过渡层）

PlanningWorkbench、ReviewBoard、ReserveNoticeBoard、OutlookInviteBoard、TimeAnalysisWorkbench、EditModal、BatchImportModal

TrashView（tv-*）与 FilterPanel（fp-*）已重建为 nx 体系；FinalCheckBoard 已确认死代码并删除（检查清单功能内置于 ReviewBoard）。

## 关键约束

- 数据兼容：localStorage 键与备份 JSON 格式不可更改（`lib/storage.js`、App.jsx 中的 `handleExport/handleImportData`）
- 业务逻辑层（`lib/`、`features/*/**Utils.js`、`electron/`）已验证可用，UI 重构不动逻辑
- 备份目录：`backup-v3.5/`（3.5 原版）、`backup-v4.0-original/`（4.0 重构前）——不要删除
- 已删除死代码：ScheduleView.jsx、AISchedulerView.jsx、Toolbar.jsx（`features/schedule/scheduleUtils.js` 仍在用，勿删）

## 其他关键文件

- `src/App.jsx` — 根组件：路由（hash）、全部状态与持久化、各页面挂载
- `public/home-eo-logo-cutout.png` — 首页 EO Logo 资产
