# 会议管理系统 — Claude Code 上下文

项目根目录：`/Users/ddss/Documents/会议管理系统-pages-clean`

## 关键文件

### 1. `src/features/home/HomeView.jsx`
首页主文件。负责首页结构、数据展示、按钮跳转、待办 / 风险 / 最近操作等板块。修改首页 UI 或逻辑时优先读这个。

### 2. `src/App.css`
首页和侧边栏样式都在这里。重点关注以下类名：
- `app-frame-home` — 首页帧布局
- `home-workspace` — 首页外层容器
- `home-command-center` — 顶部英雄区（左侧文案 + 右侧状态面板）
- `home-metric` — 数据指标卡（带左边框色块）
- `home-section` — 底部三列（待办 / 风险 / 最近操作）
- `app-sidebar-collapsed` — 侧边栏收起状态

### 3. `src/App.jsx`
应用根组件。负责把 `HomeView` 挂到路由，以及传入首页所需的数据和跳转方法（`onCreateMeeting`、`onGoToMeetings`、`onGoToPlanner` 等）。

### 4. `src/components/AppSidebar.jsx`
侧边栏组件。如需调整导航项、收起 / 展开逻辑、底部备份菜单，读这个。

### 5. `public/home-eo-logo-cutout.png`
首页顶部「总办 EO」Logo 图片资产。
