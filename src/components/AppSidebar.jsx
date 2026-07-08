import {
  Building2,
  CalendarRange,
  CalendarPlus,
  ContactRound,
  Download,
  FolderKanban,
  House,
  LineChart,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Upload,
} from 'lucide-react'

const TAB_META = {
  home: { label: '首页', icon: House },
  meetings: { label: '会议库', icon: FolderKanban },
  planner: { label: '排程', icon: CalendarRange },
  reserveNotice: { label: '预留通知', icon: Megaphone },
  outlookInvite: { label: '会邀生成', icon: CalendarPlus },
  timeAnalysis: { label: '时间分析', icon: LineChart },
  contacts: { label: '通讯录', icon: ContactRound },
  logs: { label: '记录', icon: ScrollText },
}

export function AppSidebar({
  activeTab,
  collapsed,
  onTabChange,
  onToggleCollapse,
  onImportData,
  onExport,
}) {
  return (
    <aside className={collapsed ? 'nx-sidebar nx-sidebar-collapsed' : 'nx-sidebar'}>
      <div className="nx-sidebar-brand">
        <div className="nx-sidebar-logo" aria-hidden="true">
          <Building2 size={20} />
        </div>
        {collapsed ? null : (
          <div className="nx-sidebar-brand-copy">
            <em>总裁办</em>
            <strong>会议管理系统</strong>
            <span>Version V4.0</span>
          </div>
        )}
        <button
          className="nx-sidebar-toggle"
          onClick={onToggleCollapse}
          type="button"
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className="nx-sidebar-nav" aria-label="系统主导航">
        {Object.entries(TAB_META).map(([id, meta]) => (
          <button
            key={id}
            className={activeTab === id ? 'nx-sidebar-link nx-sidebar-link-active' : 'nx-sidebar-link'}
            onClick={() => onTabChange(id)}
            type="button"
            title={meta.label}
            aria-label={meta.label}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <meta.icon size={16} />
            {collapsed ? null : meta.label}
          </button>
        ))}
      </nav>

      <div className="nx-sidebar-footer">
        <button
          className="nx-sidebar-footer-btn"
          onClick={onImportData}
          type="button"
          title="恢复系统备份"
        >
          <Upload size={15} />
          {collapsed ? null : '恢复备份'}
        </button>
        <button
          className="nx-sidebar-footer-btn"
          onClick={onExport}
          type="button"
          title="导出系统备份"
        >
          <Download size={15} />
          {collapsed ? null : '导出备份'}
        </button>
      </div>
    </aside>
  )
}
